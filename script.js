const API_URL = "https://stock-prediction-backend-xpts.onrender.com"; 
const YAHOO_API = "https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=3mo";

// =========================================================
// 1. CONFIGURATION & STATE
// =========================================================

let liveData = [];  // Stores the original fetched data (Source of Truth)
let simData = [];   // Stores the data we edit for "What-If" scenarios

// =========================================================
// 2. INITIALIZATION
// =========================================================
window.onload = async function() {
    initGauge(); // Draw the empty gauge first
    await fetchMarketData();
};

async function fetchMarketData() {
    try {
        const response = await fetch("https://corsproxy.io/?" + encodeURIComponent(YAHOO_API));
        const json = await response.json();
        
        const result = json.chart.result[0];
        const quotes = result.indicators.quote[0];
        const timestamps = result.timestamp;

        // Parse Data: [Open, High, Low, Close, Volume]
        // We map the raw arrays into a clean list of lists
        liveData = timestamps.map((time, index) => {
            return [
                quotes.open[index],
                quotes.high[index],
                quotes.low[index],
                quotes.close[index],
                quotes.volume[index]
            ];
        }).filter(day => !day.includes(null)); // Remove any incomplete data points

        // Update UI Status
        const statusEl = document.getElementById('apiStatus');
        statusEl.innerText = "System Ready • Live Data";
        statusEl.style.background = "#2ea043";

        // Initialize Simulator with Live Data
        resetToLive();

    } catch (error) {
        console.error("Data Error:", error);
        document.getElementById('apiStatus').innerText = "Data Feed Error";
        document.getElementById('apiStatus').style.background = "#da3633";
    }
}

// =========================================================
// 3. SIMULATOR LOGIC
// =========================================================

function populateInputs(lastDayData) {
    // Fill the inputs with the data from the last available day
    // Format: [Open, High, Low, Close, Volume]
    document.getElementById('simOpen').value = lastDayData[0].toFixed(2);
    document.getElementById('simHigh').value = lastDayData[1].toFixed(2);
    document.getElementById('simLow').value = lastDayData[2].toFixed(2);
    document.getElementById('simVol').value = lastDayData[4];
}

function resetToLive() {
    // 1. Reset simData to match liveData exactly
    simData = JSON.parse(JSON.stringify(liveData)); 
    
    // 2. Reset Inputs
    const lastDay = simData[simData.length - 1];
    populateInputs(lastDay);
    
    // 3. Reset Visuals
    plotMainChart(); 
    updateGauge(0); // Reset gauge to neutral
    
    // 4. Reset Text
    document.getElementById('predPrice').innerText = "---";
    document.getElementById('predReturn').innerText = "---%";
    document.getElementById('predConfidence').innerText = "---";
}

// =========================================================
// 4. API PREDICTION (THE BRAIN)
// =========================================================

async function runPrediction() {
    const btn = document.getElementById('predictBtn');
    const spinner = document.getElementById('loadingSpinner');
    
    // UI Loading State
    btn.disabled = true;
    spinner.classList.remove('hidden');

    try {
        // A. Update simData with User Inputs
        // We modify the VERY LAST row of history to match your inputs
        const lastIdx = simData.length - 1;
        simData[lastIdx][0] = parseFloat(document.getElementById('simOpen').value);
        simData[lastIdx][1] = parseFloat(document.getElementById('simHigh').value);
        simData[lastIdx][2] = parseFloat(document.getElementById('simLow').value);
        simData[lastIdx][4] = parseFloat(document.getElementById('simVol').value);
        // Note: We keep Close price as is, or you could add an input for it if you want

        // B. Prepare Payload
        // The model needs 60 returns. We send the last 70 days of raw prices to be safe.
        const payload = { recent_data: simData.slice(-70) };

        // C. Call Render API
        const response = await fetch(`${API_URL}/predict`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        // D. Handle Results
        if (result.status === "error") throw new Error(result.message);

        const predPrice = result.predicted_price;
        const predPct = result.predicted_return_percentage;
        
        // Update Price Display
        document.getElementById('predPrice').innerText = `$${predPrice.toFixed(2)}`;
        
        // Update Return % Display (Green for +, Red for -)
        const pctEl = document.getElementById('predReturn');
        pctEl.innerText = `${predPct > 0 ? "+" : ""}${predPct.toFixed(2)}%`;
        pctEl.style.color = predPct > 0 ? "#00ff88" : "#ff3333";

        // Update Confidence
        const confEl = document.getElementById('predConfidence');
        confEl.innerText = result.confidence;
        confEl.style.color = result.confidence === "HIGH" ? "#00ff88" : (result.confidence === "MEDIUM" ? "#ffcc00" : "#8b949e");

        // Update Visuals
        updateGauge(predPct);
        plotMainChart(); // Redraw chart to make sure any previous dots are cleared
        addPredictionDot(predPrice);

    } catch (error) {
        alert("API Error: The Render backend might be sleeping. Wait 30s and try again.");
        console.error(error);
    } finally {
        btn.disabled = false;
        spinner.classList.add('hidden');
    }
}

// =========================================================
// 5. CHARTING (PLOTLY)
// =========================================================

function plotMainChart() {
    // Unpack data for Plotly
    const dates = simData.map((_, i) => i); // Simple index x-axis
    const opens = simData.map(d => d[0]);
    const highs = simData.map(d => d[1]);
    const lows = simData.map(d => d[2]);
    const closes = simData.map(d => d[3]);
    const volumes = simData.map(d => d[4]);

    // Calculate SMA (Simple Moving Average)
    const sma20 = calculateSMA(closes, 20);

    // Trace 1: Candlesticks
    const traceCandle = {
        x: dates,
        close: closes,
        decreasing: { line: { color: '#ff3333' } },
        high: highs,
        increasing: { line: { color: '#00ff88' } },
        line: { color: 'rgba(31,119,180,1)' },
        low: lows,
        open: opens,
        type: 'candlestick', 
        name: 'AAPL Price',
        yaxis: 'y'
    };

    // Trace 2: SMA Trend Line
    const traceSMA = {
        x: dates,
        y: sma20,
        type: 'scatter',
        mode: 'lines',
        line: { color: '#ffff00', width: 1.5 }, // Yellow
        name: '20-Day Trend',
        hoverinfo: 'skip'
    };

    // Trace 3: Volume Bars
    const traceVol = {
        x: dates,
        y: volumes,
        type: 'bar',
        marker: { color: '#30363d' },
        name: 'Volume',
        yaxis: 'y2'
    };

    // Layout
    const layout = {
        paper_bgcolor: '#161b22',
        plot_bgcolor: '#161b22',
        font: { color: '#c9d1d9' },
        margin: { t: 30, b: 40, l: 50, r: 20 },
        showlegend: false,
        height: 450,
        xaxis: { showgrid: false, rangeslider: { visible: false }, zeroline: false },
        yaxis: { domain: [0.2, 1], gridcolor: '#30363d', autorange: true },
        yaxis2: { domain: [0, 0.15], showgrid: false, zeroline: false }
    };

    Plotly.newPlot('stockChart', [traceCandle, traceSMA, traceVol], layout);
}

function addPredictionDot(price) {
    const lastX = simData.length; // Plot it at the "Next Day" index
    
    const tracePred = {
        x: [lastX],
        y: [price],
        mode: 'markers',
        marker: { 
            color: '#00eaff', // Neon Cyan
            size: 12,
            symbol: 'diamond',
            line: { color: '#ffffff', width: 2 } 
        },
        name: 'AI Forecast',
        yaxis: 'y'
    };
    
    Plotly.addTraces('stockChart', tracePred);
}

function calculateSMA(data, window) {
    let sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < window - 1) {
            sma.push(null);
        } else {
            let sum = 0;
            for (let j = 0; j < window; j++) sum += data[i - j];
            sma.push(sum / window);
        }
    }
    return sma;
}

// =========================================================
// 6. GAUGE CHART
// =========================================================

function initGauge() {
    const data = [{
        domain: { x: [0, 1], y: [0, 1] },
        value: 0,
        title: { text: "Sentiment Strength" },
        type: "indicator",
        mode: "gauge+number",
        gauge: {
            axis: { range: [-2, 2] }, // -2% to +2% range
            bar: { color: "transparent" }, // Hide standard bar
            steps: [
                { range: [-2, -0.5], color: "#ff3333" }, // Bearish
                { range: [-0.5, 0.5], color: "#555" },   // Neutral
                { range: [0.5, 2], color: "#00ff88" }    // Bullish
            ],
            threshold: {
                line: { color: "white", width: 4 },
                thickness: 0.75,
                value: 0
            }
        }
    }];

    const layout = { 
        width: 300, height: 250, 
        margin: { t: 0, b: 0 },
        paper_bgcolor: "rgba(0,0,0,0)",
        font: { color: "white" }
    };
    
    Plotly.newPlot('gaugeChart', data, layout);
}

function updateGauge(percentChange) {
    // Update the needle (threshold line) position
    const update = {
        value: percentChange,
        "gauge.threshold.value": percentChange
    };
    
    Plotly.restyle('gaugeChart', update);
    
    // Update Text Label below gauge
    const signalEl = document.getElementById('signalText');
    if (percentChange > 0.5) {
        signalEl.innerText = "STRONG BUY";
        signalEl.style.color = "#00ff88";
    } else if (percentChange < -0.5) {
        signalEl.innerText = "STRONG SELL";
        signalEl.style.color = "#ff3333";
    } else {
        signalEl.innerText = "NEUTRAL / HOLD";
        signalEl.style.color = "#ccc";
    }
}


