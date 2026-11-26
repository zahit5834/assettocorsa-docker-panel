/**
 * Generates a self-contained CSP Online Lua script (drift.lua) for
 * Assetto Corsa / AssettoServer drift & touge servers.
 *
 * Tracks real-time slip angle, speed, corner transitions, tandem proximity
 * bonus, personal best, chat announcements, and live server Top 3 leaderboard.
 */

export function generateDriftLuaScript(params: {
  serverSlug: string;
  serverName: string;
  apiBaseUrl: string;
  offsetY?: number;
}): string {
  const safeName = params.serverName.replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 60);
  const safeSlug = encodeURIComponent(params.serverSlug);
  const scoreEndpoint = `${params.apiBaseUrl}/api/public/drift/${safeSlug}/score`;
  const lbEndpoint = `${params.apiBaseUrl}/api/public/drift/${safeSlug}/leaderboard`;
  const posY = params.offsetY ?? 92;

  return `-- AC-Panel Drift & Tandem Skoru (CSP Online Script)
-- Sunucu: ${safeName}

local MIN_DRIFT_SPEED = 24
local MIN_DRIFT_ANGLE = 12
local SPIN_ANGLE = 82
local LINK_GRACE_SEC = 2.5
local TANDEM_MAX_DIST = 11.0
local SCORE_ENDPOINT = "${scoreEndpoint}"
local LEADERBOARD_ENDPOINT = "${lbEndpoint}"
local HUD_POS_Y = ${posY}

local storage = nil
pcall(function()
  storage = ac.storage({ driftPb = 0 })
end)

local currentScore = 0
local personalBest = (storage and storage.driftPb) or 0
local combo = 1.0
local maxComboRun = 1.0
local maxAngleRun = 0
local transitionsRun = 0
local lastDriftDir = 0
local linkTimer = 0
local spinTimer = 0
local crashCooldown = 0
local prevSpeed = 0
local lastChatTime = -30
local liveAngle = 0
local isDrifting = false
local isTandem = false
local lbTimer = 18
local leaderboard = {}
local messages = {}

local function pushMsg(text, col)
  table.insert(messages, 1, { text = text, color = col, age = 0, ttl = 2.8 })
  if #messages > 4 then
    table.remove(messages)
  end
end

local function formatNumber(n)
  local s = tostring(math.floor(n + 0.5))
  local formatted = s:reverse():gsub("(%d%d%d)", "%1."):reverse()
  if formatted:sub(1, 1) == "." then
    formatted = formatted:sub(2)
  end
  return formatted
end

local function escapeJson(str)
  return tostring(str or ""):gsub("\\\\", "\\\\\\\\"):gsub('"', '\\\\"'):gsub("[%c]", " ")
end

local function fetchLeaderboard()
  pcall(function()
    if not web or not web.get then return end
    web.get(LEADERBOARD_ENDPOINT, function(err, response)
      if err or not response or not response.body then return end
      if JSON and JSON.parse then
        local ok, data = pcall(JSON.parse, response.body)
        if ok and type(data) == "table" and type(data.scores) == "table" then
          leaderboard = data.scores
        end
      end
    end)
  end)
end

local function submitScore(finalScore, bestCombo, bestAngle, transitions)
  if finalScore < 500 then return end
  pcall(function()
    if not web or not web.post then return end
    local driverName = "Surucu"
    local carId = ""
    pcall(function() driverName = ac.getDriverName(0) or "Surucu" end)
    pcall(function() carId = ac.getCarID(0) or "" end)
    local payload = string.format(
      '{"driverName":"%s","carId":"%s","score":%d,"maxCombo":%.1f,"maxAngleDeg":%d,"transitions":%d}',
      escapeJson(driverName),
      escapeJson(carId),
      math.floor(finalScore + 0.5),
      bestCombo,
      math.floor(bestAngle + 0.5),
      math.floor(transitions)
    )
    web.post(SCORE_ENDPOINT, { ["Content-Type"] = "application/json" }, payload, function()
      fetchLeaderboard()
    end)
  end)
end

local function computeDriftAngle(car)
  local vel = car.velocity
  local look = car.look
  local side = car.side
  if not vel or not look or not side then return 0, 0 end
  local fwd = vel.x * look.x + vel.z * look.z
  local lat = vel.x * side.x + vel.z * side.z
  if fwd < 1.5 then
    local horizSpeed = math.sqrt(vel.x * vel.x + vel.z * vel.z)
    if horizSpeed < 2.0 then return 0, 0 end
    return 90 * (lat >= 0 and 1 or -1), 90
  end
  local signedDeg = math.deg(math.atan2(lat, fwd))
  return signedDeg, math.abs(signedDeg)
end

local function resetRun()
  currentScore = 0
  combo = 1.0
  maxComboRun = 1.0
  maxAngleRun = 0
  transitionsRun = 0
  lastDriftDir = 0
  linkTimer = 0
  spinTimer = 0
end

local function bankRun()
  local finalScore = math.floor(currentScore + 0.5)
  if finalScore >= 200 then
    if finalScore > personalBest then
      personalBest = finalScore
      if storage then
        pcall(function() storage.driftPb = personalBest end)
      end
      pushMsg("YENI DRIFT REKORU! " .. formatNumber(personalBest), rgbm(0.25, 0.95, 0.65, 1))
      submitScore(finalScore, maxComboRun, maxAngleRun, transitionsRun)

      local now = os.clock()
      if finalScore >= 2000 and (now - lastChatTime) >= 20 then
        lastChatTime = now
        pcall(function()
          ac.sendChatMessage(string.format(
            "[DRIFT REKORU] %s puan! (x%.1f Combo | %d° max aci | %d gecis)",
            formatNumber(finalScore),
            maxComboRun,
            math.floor(maxAngleRun + 0.5),
            transitionsRun
          ))
        end)
      end
    else
      if finalScore >= 1000 then
        submitScore(finalScore, maxComboRun, maxAngleRun, transitionsRun)
      end
      pushMsg("DRIFT KAYDEDILDI: +" .. formatNumber(finalScore), rgbm(0.45, 0.82, 1.0, 1))
    end
  end
  resetRun()
end

local function failRun(reason)
  local lost = math.floor(currentScore + 0.5)
  if lost >= 200 then
    pushMsg(reason .. " (-" .. formatNumber(lost) .. ")", rgbm(1.0, 0.30, 0.35, 1))
  end
  resetRun()
end

fetchLeaderboard()

function script.update(dt)
  if dt <= 0 or dt > 0.25 then return end

  local sim = ac.getSim()
  local player = ac.getCar(0)
  if not sim or not player then return end

  for i = #messages, 1, -1 do
    messages[i].age = messages[i].age + dt
    if messages[i].age >= messages[i].ttl then
      table.remove(messages, i)
    end
  end

  lbTimer = lbTimer + dt
  if lbTimer >= 25 then
    lbTimer = 0
    fetchLeaderboard()
  end

  if sim.isInMainMenu or sim.isPaused then return end

  if crashCooldown > 0 then
    crashCooldown = crashCooldown - dt
  end

  local speed = player.speedKmh or 0
  local speedDrop = prevSpeed - speed
  prevSpeed = speed

  if player.isInPitlane then
    if currentScore > 0 then bankRun() end
    isDrifting = false
    isTandem = false
    liveAngle = 0
    return
  end

  -- Hard wall hit (collidedWith == 0) or heavy car crash cancels unbanked drift
  -- Gentle tandem door rubs (collidedWith > 0 with small speed drop) are forgiven!
  local hardWallHit = (player.collidedWith == 0 and speedDrop > 8)
  local hardCarHit = (player.collidedWith ~= nil and player.collidedWith > 0 and speedDrop > 20)
  local suddenCrash = (speedDrop > 38 and speed < 50)
  if (hardWallHit or hardCarHit or suddenCrash) and crashCooldown <= 0 then
    crashCooldown = 1.6
    isDrifting = false
    isTandem = false
    if currentScore > 0 then
      failRun("CARPMA! SKOR SILINDI")
    end
    return
  end

  local signedAngle, absAngle = computeDriftAngle(player)
  liveAngle = signedAngle

  -- Detect spin-out (>82 deg for >1.1s)
  if absAngle >= SPIN_ANGLE and speed >= 8 then
    spinTimer = spinTimer + dt
    if spinTimer >= 1.1 then
      isDrifting = false
      isTandem = false
      if currentScore > 0 then
        failRun("SPIN! COMBO BITTI")
      end
      return
    end
  else
    spinTimer = 0
  end

  -- Check tandem proximity with any other drifting car
  isTandem = false
  if absAngle >= MIN_DRIFT_ANGLE and speed >= MIN_DRIFT_SPEED then
    local pPos = player.position
    local carsCount = sim.carsCount or 1
    for i = 1, carsCount - 1 do
      local other = ac.getCar(i)
      if other and other.isConnected and not other.isInPitlane and (other.speedKmh or 0) >= 20 then
        local d = (other.position - pPos):length()
        if d <= TANDEM_MAX_DIST then
          local _, otherAbs = computeDriftAngle(other)
          if otherAbs >= 10 then
            isTandem = true
            break
          end
        end
      end
    end
  end

  -- Active drift scoring
  if speed >= MIN_DRIFT_SPEED and absAngle >= MIN_DRIFT_ANGLE and absAngle < SPIN_ANGLE then
    isDrifting = true
    linkTimer = LINK_GRACE_SEC

    if absAngle > maxAngleRun then
      maxAngleRun = absAngle
    end

    -- Detect drift direction transition (left <-> right)
    local curDir = signedAngle >= 0 and 1 or -1
    if lastDriftDir ~= 0 and curDir ~= lastDriftDir and absAngle >= 15 then
      transitionsRun = transitionsRun + 1
      combo = math.min(10.0, combo + 0.55)
      if combo > maxComboRun then maxComboRun = combo end
      local bonus = math.floor(350 * combo + 0.5)
      currentScore = currentScore + bonus
      pushMsg(string.format("GECIS! +%s (x%.1f)", formatNumber(bonus), combo), rgbm(0.75, 0.45, 1.0, 1))
    end
    lastDriftDir = curDir

    -- Smooth combo growth during long drifts
    combo = math.min(10.0, combo + dt * (isTandem and 0.22 or 0.11))
    if combo > maxComboRun then maxComboRun = combo end

    local angleFactor = math.min(1.85, (absAngle / 32.0) ^ 1.15)
    local speedFactor = math.min(2.2, (speed / 60.0) ^ 1.05)
    local tandemMult = isTandem and 1.5 or 1.0
    currentScore = currentScore + (dt * 125.0 * angleFactor * speedFactor * combo * tandemMult)
  else
    isDrifting = false
    if currentScore > 0 then
      linkTimer = linkTimer - dt
      if linkTimer <= 0 then
        bankRun()
      end
    end
  end
end

function script.drawUI()
  local sim = ac.getSim()
  local player = ac.getCar(0)
  if not sim or not player or sim.isInMainMenu then return end

  local hasLb = #leaderboard > 0
  local boxW = 300
  local baseH = 166 + (hasLb and (24 + math.min(3, #leaderboard) * 18) or 0) + (#messages * 20)

  ui.transparentWindow("acPanelDriftHud", vec2(24, HUD_POS_Y), vec2(boxW + 16, baseH + 16), true, false, function()
    local p0 = vec2(0, 0)
    local p1 = vec2(boxW, baseH)

    -- Dark glass panel with purple/magenta drift accent
    ui.drawRectFilled(p0, p1, rgbm(0.05, 0.06, 0.11, 0.84), 10)
    local borderCol = isTandem and rgbm(0.22, 0.90, 0.95, 0.85) or rgbm(0.66, 0.33, 0.97, 0.6)
    ui.drawRect(p0, p1, borderCol, 10, 1.3)
    ui.drawRectFilled(vec2(10, 0), vec2(boxW - 10, 3), borderCol, 2)

    local y = 10
    ui.setCursor(vec2(14, y))
    ui.dwriteText(isTandem and "DRIFT • TANDEM x1.5!" or "DRIFT & TANDEM SKORU", 11,
      isTandem and rgbm(0.25, 0.95, 1.0, 1) or rgbm(0.75, 0.65, 0.95, 1))

    local comboCol = combo >= 5 and rgbm(1, 0.30, 0.65, 1)
      or (combo >= 2.5 and rgbm(0.75, 0.45, 1.0, 1) or rgbm(0.35, 0.82, 1.0, 1))
    ui.drawRectFilled(vec2(boxW - 64, y - 2), vec2(boxW - 12, y + 18), rgbm(comboCol.r, comboCol.g, comboCol.b, 0.22), 5)
    ui.setCursor(vec2(boxW - 54, y - 1))
    ui.dwriteText(string.format("x%.1f", combo), 13, comboCol)

    y = y + 20

    -- Big live score + live angle readout
    ui.setCursor(vec2(14, y))
    local scoreCol = currentScore > 0 and rgbm(1, 1, 1, 1) or rgbm(0.55, 0.62, 0.72, 1)
    ui.dwriteText(formatNumber(currentScore), 30, scoreCol)

    local absAng = math.floor(math.abs(liveAngle) + 0.5)
    local angCol = absAng >= 40 and rgbm(1, 0.35, 0.65, 1)
      or (absAng >= 15 and rgbm(0.35, 0.95, 0.68, 1) or rgbm(0.6, 0.68, 0.78, 1))
    ui.setCursor(vec2(boxW - 76, y + 6))
    ui.dwriteText(string.format("%d°", absAng), 20, angCol)

    y = y + 38

    -- Live angle indicator bar (centered)
    local barX0 = 14
    local barW = boxW - 28
    local midX = barX0 + barW * 0.5
    ui.drawRectFilled(vec2(barX0, y), vec2(barX0 + barW, y + 6), rgbm(0.14, 0.17, 0.25, 0.95), 3)
    local normAng = math.max(-1, math.min(1, liveAngle / 70.0))
    if math.abs(normAng) > 0.03 then
      local fillX = midX + normAng * (barW * 0.5)
      local ax0 = math.min(midX, fillX)
      local ax1 = math.max(midX, fillX)
      ui.drawRectFilled(vec2(ax0, y), vec2(ax1, y + 6), angCol, 3)
    end
    ui.drawRectFilled(vec2(midX - 1, y - 1), vec2(midX + 1, y + 7), rgbm(1, 1, 1, 0.5), 0)

    y = y + 11

    -- Link grace timer bar
    local graceRatio = currentScore > 0 and math.max(0, math.min(1, linkTimer / LINK_GRACE_SEC)) or 0
    ui.drawRectFilled(vec2(barX0, y), vec2(barX0 + barW, y + 4), rgbm(0.14, 0.17, 0.25, 0.95), 2)
    if graceRatio > 0.01 then
      ui.drawRectFilled(vec2(barX0, y), vec2(barX0 + barW * graceRatio, y + 4), comboCol, 2)
    end

    y = y + 10

    -- Speed & status row
    local speed = math.floor(player.speedKmh or 0)
    ui.setCursor(vec2(14, y))
    if player.isInPitlane then
      ui.dwriteText("Pitten cik ve yanlamaya basla!", 12, rgbm(0.65, 0.72, 0.82, 1))
    elseif isDrifting then
      ui.dwriteText(
        string.format("%d km/h  |  %d Gecis%s", speed, transitionsRun, isTandem and "  |  TANDEM!" or ""),
        12,
        isTandem and rgbm(0.25, 0.95, 1.0, 1) or rgbm(0.35, 0.95, 0.65, 1)
      )
    elseif currentScore > 0 then
      ui.dwriteText(string.format("Baglamak icin yanla! (%.1fs)", math.max(0, linkTimer)), 12, rgbm(1, 0.78, 0.25, 1))
    else
      ui.dwriteText(string.format("%d km/h  |  12°+ aci ile drift baslar", speed), 12, rgbm(0.68, 0.74, 0.84, 1))
    end

    y = y + 22

    -- Personal best row
    ui.drawRectFilled(vec2(14, y), vec2(boxW - 14, y + 1), rgbm(1, 1, 1, 0.08), 0)
    y = y + 7
    ui.setCursor(vec2(14, y))
    ui.dwriteText("EN IYI DRIFT:", 11, rgbm(0.6, 0.68, 0.78, 1))
    ui.setCursor(vec2(118, y))
    ui.dwriteText(formatNumber(personalBest) .. " PT", 12, rgbm(1, 0.82, 0.28, 1))
    y = y + 20

    -- Floating event messages
    for _, m in ipairs(messages) do
      local alpha = math.max(0, math.min(1, 1.0 - (m.age / m.ttl) ^ 2))
      ui.setCursor(vec2(14, y))
      ui.dwriteText(m.text, 12, rgbm(m.color.r, m.color.g, m.color.b, alpha))
      y = y + 20
    end

    -- Top 3 Drift Leaderboard
    if hasLb then
      y = y + 4
      ui.drawRectFilled(vec2(14, y), vec2(boxW - 14, y + 1), rgbm(1, 1, 1, 0.08), 0)
      y = y + 6
      ui.setCursor(vec2(14, y))
      ui.dwriteText("DRIFT TOP 3", 10, rgbm(0.75, 0.65, 0.95, 1))
      y = y + 16
      local limit = math.min(3, #leaderboard)
      for idx = 1, limit do
        local row = leaderboard[idx]
        local name = tostring(row.driver_name or "Surucu")
        if #name > 16 then name = name:sub(1, 15) .. "." end
        ui.setCursor(vec2(14, y))
        ui.dwriteText(string.format("#%d %s", idx, name), 11, rgbm(0.88, 0.91, 0.96, 1))
        ui.setCursor(vec2(boxW - 92, y))
        ui.dwriteText(formatNumber(tonumber(row.score) or 0), 11, rgbm(0.75, 0.50, 1.0, 1))
        y = y + 18
      end
    end
  end)
end
`;
}
