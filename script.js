// REPLACE with your Render URL
const API_URL = "https://stock-prediction-backend-xpts.onrender.com"; 
const YAHOO_API = "https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=3mo";

let liveData = [];  // Stores the original fetched data
let simData = [];   // Stores the data we send to the AI (editable)

// 1. INITIALIZE
window.onload = async function() {
    initGauge(); // Draw empty gauge
    await fetchMarketData();
};

async function fetchMarketData() {
    try {
        const response = await fetch("https://corsproxy.io/?" + encodeURIComponent(YAHOO_API));
        const json = await response.json();
        
        const result = json.chart.result[0];
        const quotes = result.indicators.quote[0];
        const timestamps = result.timestamp;

        // Parse Data [Open, High, Low, Close, Volume]
        liveData = timestamps.map((time, index) => {
            return [
                quotes.open[index],
                quotes.high[index],
                quotes.low[index],
                quotes.close[index],
                quotes.volume[index]
            ];
        }).filter(day => !day.includes(null));

        // Set Simulator Data to match Live Data initially
        resetToLive();
        
        // Update Status
        const statusEl = document.getElementById('apiStatus');
        statusEl.innerText = "System Ready • Live Data";
        statusEl.style.background = "#2ea043";

        // Draw Chart
        plotMainChart();

    } catch (error) {
        console.error("Data Error:", error);
        document.getElementById('apiStatus').innerText = "Data Feed Error";
        document.getElementById('apiStatus').style.background = "#da3633";
    }
}

// 2. FILL INPUTS (The Simulator)
function populateInputs(lastDayData) {
    // [Open, High, Low, Close, Volume]
    document.getElementById('simOpen').value = lastDayData[0].toFixed(2);
    document.getElementById('simHigh').value = lastDayData[1].toFixed(2);
    document.getElementById('simLow').value = lastDayData[2].toFixed(2);
    // Note: We don't edit Close, as that's what we are predicting relative to, 
    // or we assume the user edits the 'current' day to predict tomorrow.
    document.getElementById('simVol').value = lastDayData[4];
}

function resetToLive() {
    // Clone live data into simData
    simData = JSON.parse(JSON.stringify(liveData)); 
    
    // Fill inputs with the LAST day's real data
    const lastDay = simData[simData.length - 1];
    populateInputs(lastDay);
    
    // Reset Chart
    plotMainChart(); 
    updateGauge(0); // Reset gauge
    
    document.getElementById('predPrice').innerText = "---";
    document.getElementById('predReturn').innerText = "---%";
}

// 3. RUN PREDICTION
async function runPrediction() {
    const btn = document.getElementById('predictBtn');
    const spinner = document.getElementById('loadingSpinner');
    
    btn.disabled = true;
    spinner.classList.remove('hidden');

    try {
        // A. UPDATE SIMDATA WITH USER INPUTS
        // We modify the LAST row of the data to reflect "What-If" scenarios
        const lastIdx = simData.length - 1;
        simData[lastIdx][0] = parseFloat(document.getElementById('simOpen').value);
        simData[lastIdx][1] = parseFloat(document.getElementById('simHigh').value);
        simData[lastIdx][2] = parseFloat(document.getElementById('simLow').value);
        simData[lastIdx][4] = parseFloat(document.getElementById('simVol').value);

        // B. SEND TO API
        const payload = { recent_data: simData.slice(-70) }; // Send last 70 days

        const response = await fetch(`${API_URL}/predict`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        // C. UPDATE UI RESULTS
        const predPrice = result.predicted_price;
        const predPct = result.predicted_return_percentage;
        
        document.getElementById('predPrice').innerText = `$${predPrice.toFixed(2)}`;
        
        const pctEl = document.getElementById('predReturn');
        pctEl.innerText = `${predPct > 0 ? "+" : ""}${predPct.toFixed(2)}%`;
        pctEl.style.color = predPct > 0 ? "#00ff88" : "#ff3333";

        document.getElementById('predConfidence').innerText = result.confidence;

        // D. UPDATE VISUALS
        updateGauge(predPct);
        addPredictionDot(predPrice);

    } catch (error) {
        alert("API Error: Is Render awake?");
        console.error(error);
    } finally {
        btn.disabled = false;
        spinner.classList.add('hidden');
    }
}

// 4. PLOTLY CHARTS
function plotMainChart() {
    const closes = simData.map(d => d[3]); // Close prices
    // Generate dummy dates (simplified for demo)
    const xIdx = Array.from({length: closes.length}, (_, i) => i);

    const trace1 = {
        x: xIdx,
        y: closes,
        type: 'scatter',
        mode: 'lines',
        name: 'AAPL Market',
        line: { color: '#00b4d8', width: 2 }
    };

    const layout = {
        paper_bgcolor: '#161b22',
        plot_bgcolor: '#161b22',
        font: { color: '#c9d1d9' },
        margin: { t: 20, b: 40, l: 40, r: 20 },
        showlegend: false,
        xaxis: { showgrid: false, zeroline: false },
        yaxis: { gridcolor: '#30363d' }
    };

    Plotly.newPlot('stockChart', [trace1], layout);
}

function addPredictionDot(price) {
    // Add a pulsing-like neon dot at the end
    const lastX = simData.length; // Next day index
    
    const tracePred = {
        x: [lastX],
        y: [price],
        mode: 'markers',
        marker: { 
            color: '#00ff88', 
            size: 15,
            line: { color: '#ffffff', width: 2 } 
        },
        name: 'AI Forecast'
    };
    
    Plotly.addTraces('stockChart', tracePred);
}

function initGauge() {
    const data = [{
        domain: { x: [0, 1], y: [0, 1] },
        value: 0,
        title: { text: "Sentiment Strength" },
        type: "indicator",
        mode: "gauge+number",
        gauge: {
            axis: { range: [-2, 2] }, // Range from -2% to +2%
            bar: { color: "transparent" }, // Hide default bar
            steps: [
                { range: [-2, -0.5], color: "#ff3333" }, // Strong Sell
                { range: [-0.5, 0.5], color: "#555" },   // Neutral
                { range: [0.5, 2], color: "#00ff88" }    // Strong Buy
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
    // Update the gauge value and the threshold line position
    const update = {
        value: percentChange,
        "gauge.threshold.value": percentChange
    };
    
    Plotly.restyle('gaugeChart', update);
    
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

