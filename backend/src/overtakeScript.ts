/**
 * Generates a self-contained CSP Online Lua script (overtake.lua) for
 * Assetto Corsa / AssettoServer traffic servers.
 *
 * Served directly by the panel over HTTP so players automatically receive
 * the in-game Makas & Hiz Skoru HUD with zero manual downloads.
 */

export function generateOvertakeLuaScript(params: {
  serverSlug: string;
  serverName: string;
  minSpeedKmh: number;
  apiBaseUrl: string;
}): string {
  const minSpeed = Math.max(40, Math.min(200, Math.round(params.minSpeedKmh || 80)));
  const safeName = params.serverName.replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 60);
  const safeSlug = encodeURIComponent(params.serverSlug);
  const scoreEndpoint = `${params.apiBaseUrl}/api/public/overtake/${safeSlug}/score`;
  const lbEndpoint = `${params.apiBaseUrl}/api/public/overtake/${safeSlug}/leaderboard`;

  return `-- AC-Panel Makas & Hiz Skoru (CSP Online Script)
-- Sunucu: ${safeName}

local MIN_SPEED = ${minSpeed}
local PASS_MAX_DIST = 8.0
local NEAR_MISS_DIST = 4.0
local ULTRA_CLOSE_DIST = 2.4
local COMBO_TIMEOUT = 6.5
local SCORE_ENDPOINT = "${scoreEndpoint}"
local LEADERBOARD_ENDPOINT = "${lbEndpoint}"

local storage = nil
pcall(function()
  storage = ac.storage({ pb = 0, totalOvertakes = 0 })
end)

local totalScore = 0
local personalBest = (storage and storage.pb) or 0
local combo = 1.0
local maxComboRun = 1.0
local maxSpeedRun = 0
local runOvertakes = 0
local comboTimer = 0
local slowTimer = 0
local crashCooldown = 0
local lastChatTime = -30
local prevSpeed = 0
local lbTimer = 18
local leaderboard = {}

-- Per-car pass tracking table
local carStates = {}

-- Floating HUD notifications
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

local function submitScore(finalScore, bestCombo, bestSpeed, overtakes)
  if finalScore < 500 then return end
  pcall(function()
    if not web or not web.post then return end
    local driverName = "Surucu"
    local carId = ""
    pcall(function() driverName = ac.getDriverName(0) or "Surucu" end)
    pcall(function() carId = ac.getCarID(0) or "" end)
    local payload = string.format(
      '{"driverName":"%s","carId":"%s","score":%d,"maxCombo":%d,"maxSpeedKmh":%d,"overtakes":%d}',
      escapeJson(driverName),
      escapeJson(carId),
      math.floor(finalScore + 0.5),
      math.floor(bestCombo * 10) / 10 >= 1 and math.floor(bestCombo + 0.5) or 1,
      math.floor(bestSpeed + 0.5),
      math.floor(overtakes)
    )
    web.post(SCORE_ENDPOINT, { ["Content-Type"] = "application/json" }, payload, function()
      fetchLeaderboard()
    end)
  end)
end

local function finishRun(reason, col)
  local finalScore = math.floor(totalScore + 0.5)
  if finalScore > 0 then
    if finalScore > personalBest then
      personalBest = finalScore
      if storage then
        pcall(function() storage.pb = personalBest end)
      end
      pushMsg("YENI REKOR! " .. formatNumber(personalBest) .. " PT", rgbm(0.25, 0.95, 0.55, 1))
      submitScore(finalScore, maxComboRun, maxSpeedRun, runOvertakes)

      local now = os.clock()
      if finalScore >= 1500 and (now - lastChatTime) >= 20 then
        lastChatTime = now
        pcall(function()
          ac.sendChatMessage(string.format(
            "[MAKAS REKORU] %s puan! (x%.1f Combo | %d makas | %d km/h)",
            formatNumber(finalScore),
            maxComboRun,
            runOvertakes,
            math.floor(maxSpeedRun + 0.5)
          ))
        end)
      end
    else
      if finalScore >= 1000 then
        submitScore(finalScore, maxComboRun, maxSpeedRun, runOvertakes)
      end
      if reason then
        pushMsg(reason .. " (" .. formatNumber(finalScore) .. " pt)", col or rgbm(1, 0.35, 0.35, 1))
      end
    end
  end

  totalScore = 0
  combo = 1.0
  maxComboRun = 1.0
  maxSpeedRun = 0
  runOvertakes = 0
  comboTimer = 0
  slowTimer = 0
end

-- Initial leaderboard load
fetchLeaderboard()

function script.update(dt)
  if dt <= 0 or dt > 0.25 then return end

  local sim = ac.getSim()
  local player = ac.getCar(0)
  if not sim or not player then return end

  -- Update floating notifications
  for i = #messages, 1, -1 do
    messages[i].age = messages[i].age + dt
    if messages[i].age >= messages[i].ttl then
      table.remove(messages, i)
    end
  end

  -- Periodic leaderboard refresh
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
  local suddenImpact = (prevSpeed - speed) > 42 and prevSpeed > 60
  prevSpeed = speed

  if player.isInPitlane then
    if totalScore > 0 then
      finishRun("PITE GIRILDI", rgbm(0.7, 0.75, 0.85, 1))
    end
    return
  end

  -- Collision detection (CSP: collidedWith >= 0 means wall=0 or car>0, -1=none)
  local collided = (player.collidedWith ~= nil and player.collidedWith >= 0) or suddenImpact
  if collided and crashCooldown <= 0 then
    crashCooldown = 1.8
    if totalScore > 0 then
      finishRun("KAZA! COMBO BITTI", rgbm(1, 0.28, 0.28, 1))
    end
    return
  end

  if speed < MIN_SPEED then
    if totalScore > 0 then
      slowTimer = slowTimer + dt
      if slowTimer >= 2.5 then
        finishRun("YAVASLADIN!", rgbm(1, 0.72, 0.25, 1))
      end
    end
    return
  end

  slowTimer = 0
  if speed > maxSpeedRun then
    maxSpeedRun = speed
  end

  -- Continuous speed score accumulation
  local speedMult = math.max(1.0, (speed / 90.0) ^ 1.35)
  totalScore = totalScore + (dt * 26.0 * speedMult * combo)

  -- Combo decay when not overtaking
  if combo > 1.0 then
    comboTimer = comboTimer - dt
    if comboTimer <= 0 then
      combo = math.max(1.0, combo - dt * 0.65)
    end
  end

  -- Check overtakes & close passes (Makas) against all nearby cars
  local pPos = player.position
  local pLook = player.look
  local carsCount = sim.carsCount or 1

  for i = 1, carsCount - 1 do
    local other = ac.getCar(i)
    if other and other.isConnected and not other.isInPitlane then
      local rel = other.position - pPos
      local dist = rel:length()

      local st = carStates[i]
      if not st then
        st = { wasAhead = false, closest = 999, cooldown = 0 }
        carStates[i] = st
      end

      if st.cooldown > 0 then
        st.cooldown = st.cooldown - dt
      end

      if dist < 24 then
        -- Positive forwardDot means the other car is in FRONT of player
        local forwardDot = rel.x * pLook.x + rel.y * pLook.y + rel.z * pLook.z
        if dist < st.closest then
          st.closest = dist
        end

        if forwardDot > 1.8 then
          st.wasAhead = true
        elseif forwardDot < -1.5 and st.wasAhead and st.cooldown <= 0 then
          -- Player just passed this car!
          local minDist = st.closest
          st.wasAhead = false
          st.closest = 999
          st.cooldown = 3.5

          if minDist <= PASS_MAX_DIST then
            runOvertakes = runOvertakes + 1
            if storage then
              pcall(function() storage.totalOvertakes = (storage.totalOvertakes or 0) + 1 end)
            end

            local bonus = 250
            local comboGain = 0.45
            local label = "SOLLAMA"
            local col = rgbm(0.35, 0.82, 1.0, 1)

            if minDist <= ULTRA_CLOSE_DIST and speed >= 150 then
              bonus = 900
              comboGain = 1.15
              label = "JILET MAKAS!"
              col = rgbm(1.0, 0.25, 0.55, 1)
            elseif minDist <= NEAR_MISS_DIST then
              bonus = 500
              comboGain = 0.75
              label = "YAKIN MAKAS!"
              col = rgbm(1.0, 0.78, 0.18, 1)
            end

            combo = math.min(10.0, combo + comboGain)
            if combo > maxComboRun then
              maxComboRun = combo
            end
            comboTimer = COMBO_TIMEOUT

            local pts = math.floor(bonus * combo + 0.5)
            totalScore = totalScore + pts
            pushMsg(string.format("%s +%s", label, formatNumber(pts)), col)
          end
        end
      else
        st.wasAhead = false
        st.closest = 999
      end
    end
  end
end

function script.drawUI()
  local sim = ac.getSim()
  local player = ac.getCar(0)
  if not sim or not player or sim.isInMainMenu then return end

  local hasLb = #leaderboard > 0
  local boxW = 296
  local baseH = 148 + (hasLb and (24 + math.min(3, #leaderboard) * 18) or 0) + (#messages * 20)

  ui.transparentWindow("acPanelOvertakeHud", vec2(24, 92), vec2(boxW + 16, baseH + 16), true, false, function()
    local p0 = vec2(0, 0)
    local p1 = vec2(boxW, baseH)

    -- Glass dark background & border
    ui.drawRectFilled(p0, p1, rgbm(0.05, 0.07, 0.11, 0.82), 10)
    ui.drawRect(p0, p1, rgbm(0.86, 0.15, 0.15, 0.55), 10, 1.2)
    -- Top red accent strip
    ui.drawRectFilled(vec2(10, 0), vec2(boxW - 10, 3), rgbm(0.94, 0.25, 0.25, 0.95), 2)

    local y = 10
    local speed = player.speedKmh or 0
    local speedMult = speed >= MIN_SPEED and math.max(1.0, (speed / 90.0) ^ 1.35) or 0

    -- Header row
    ui.setCursor(vec2(14, y))
    ui.dwriteText("MAKAS & HIZ SKORU", 11, rgbm(0.62, 0.70, 0.82, 1))

    -- Combo badge on right
    local comboCol = combo >= 5 and rgbm(1, 0.25, 0.45, 1)
      or (combo >= 2.5 and rgbm(1, 0.72, 0.18, 1) or rgbm(0.25, 0.82, 0.95, 1))
    local comboTxt = string.format("x%.1f", combo)
    ui.drawRectFilled(vec2(boxW - 64, y - 2), vec2(boxW - 12, y + 18), rgbm(comboCol.r, comboCol.g, comboCol.b, 0.22), 5)
    ui.setCursor(vec2(boxW - 54, y - 1))
    ui.dwriteText(comboTxt, 13, comboCol)

    y = y + 20

    -- Big live score
    ui.setCursor(vec2(14, y))
    local scoreCol = totalScore > 0 and rgbm(1, 1, 1, 1) or rgbm(0.55, 0.62, 0.72, 1)
    ui.dwriteText(formatNumber(totalScore), 30, scoreCol)

    ui.setCursor(vec2(boxW - 70, y + 14))
    ui.dwriteText("PUAN", 11, rgbm(0.55, 0.63, 0.74, 1))

    y = y + 38

    -- Combo timer progress bar
    local barRatio = combo > 1.0 and math.max(0, math.min(1, comboTimer / COMBO_TIMEOUT)) or 0
    ui.drawRectFilled(vec2(14, y), vec2(boxW - 14, y + 5), rgbm(0.15, 0.19, 0.27, 0.95), 3)
    if barRatio > 0.01 then
      ui.drawRectFilled(vec2(14, y), vec2(14 + (boxW - 28) * barRatio, y + 5), comboCol, 3)
    end

    y = y + 12

    -- Speed / Status row
    ui.setCursor(vec2(14, y))
    if player.isInPitlane then
      ui.dwriteText("Pitten cik ve " .. MIN_SPEED .. "+ km/h hizlan", 12, rgbm(0.65, 0.72, 0.82, 1))
    elseif speed < MIN_SPEED then
      ui.dwriteText(string.format("%d km/h  |  Baslamak icin %d+ km/h", math.floor(speed), MIN_SPEED), 12, rgbm(0.95, 0.72, 0.25, 1))
    else
      ui.dwriteText(
        string.format("%d km/h  |  Hiz x%.1f  |  %d Makas", math.floor(speed), speedMult, runOvertakes),
        12,
        rgbm(0.35, 0.92, 0.62, 1)
      )
    end

    y = y + 22

    -- Personal best row
    ui.drawRectFilled(vec2(14, y), vec2(boxW - 14, y + 1), rgbm(1, 1, 1, 0.08), 0)
    y = y + 7
    ui.setCursor(vec2(14, y))
    ui.dwriteText("EN IYI REKORUN:", 11, rgbm(0.6, 0.68, 0.78, 1))
    ui.setCursor(vec2(130, y))
    ui.dwriteText(formatNumber(personalBest) .. " PT", 12, rgbm(1, 0.82, 0.28, 1))
    y = y + 20

    -- Floating event messages
    for _, m in ipairs(messages) do
      local alpha = math.max(0, math.min(1, 1.0 - (m.age / m.ttl) ^ 2))
      ui.setCursor(vec2(14, y))
      ui.dwriteText(m.text, 12, rgbm(m.color.r, m.color.g, m.color.b, alpha))
      y = y + 20
    end

    -- Top 3 Server Leaderboard
    if hasLb then
      y = y + 4
      ui.drawRectFilled(vec2(14, y), vec2(boxW - 14, y + 1), rgbm(1, 1, 1, 0.08), 0)
      y = y + 6
      ui.setCursor(vec2(14, y))
      ui.dwriteText("SUNUCU TOP 3", 10, rgbm(0.55, 0.65, 0.80, 1))
      y = y + 16
      local limit = math.min(3, #leaderboard)
      for idx = 1, limit do
        local row = leaderboard[idx]
        local name = tostring(row.driver_name or "Surucu")
        if #name > 16 then name = name:sub(1, 15) .. "." end
        ui.setCursor(vec2(14, y))
        ui.dwriteText(string.format("#%d %s", idx, name), 11, rgbm(0.88, 0.91, 0.96, 1))
        ui.setCursor(vec2(boxW - 92, y))
        ui.dwriteText(formatNumber(tonumber(row.score) or 0), 11, rgbm(0.35, 0.92, 0.62, 1))
        y = y + 18
      end
    end
  end)
end
`;
}
