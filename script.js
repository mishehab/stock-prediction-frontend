// REPLACE THIS with your actual Render API URL after you deploy the backend
const API_URL = "https://stock-prediction-backend-xpts.onrender.com/"; 

// Public proxy to get Yahoo Finance data (free)
const YAHOO_API = "https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=3mo";

let stockData = [];

// 1. Load Data on Page Load
window.onload = async function() {
    await fetchMarketData();
};

async function fetchMarketData() {
    try {
        const response = await fetch("https://corsproxy.io/?" + encodeURIComponent(YAHOO_API));
        const json = await response.json();
        
        const result = json.chart.result[0];
        const quotes = result.indicators.quote[0];
        const timestamps = result.timestamp;

        // Parse Yahoo Data into [Open, High, Low, Close, Volume] format
        stockData = timestamps.map((time, index) => {
            return [
                quotes.open[index],
                quotes.high[index],
                quotes.low[index],
                quotes.close[index],
                quotes.volume[index]
            ];
        }).filter(day => !day.includes(null)); // Remove incomplete days

        // Update UI with latest price
        const lastPrice = stockData[stockData.length - 1][3]; // Close is index 3
        document.getElementById('latestClose').innerText = `$${lastPrice.toFixed(2)}`;
        document.getElementById('apiStatus').innerText = "System Ready";
        document.getElementById('apiStatus').style.background = "#2ea043";

        // Draw initial chart
        plotChart(timestamps, quotes.close);

    } catch (error) {
        console.error("Error fetching market data:", error);
        document.getElementById('apiStatus').innerText = "Data Error";
        document.getElementById('apiStatus').style.background = "#da3633";
    }
}

// 2. The Prediction Function
async function runPrediction() {
    const btn = document.getElementById('predictBtn');
    const spinner = document.getElementById('loadingSpinner');
    
    // UI Loading State
    btn.disabled = true;
    btn.innerText = "Processing...";
    spinner.classList.remove('hidden');

    try {
        // Send the last 61 days of data to YOUR Render Backend
        // The model needs 60 returns, so we send 60+ days of raw data
        const payload = {
            recent_data: stockData.slice(-70) // Send last 70 days to be safe
        };

        const response = await fetch(`${API_URL}/predict`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        // 3. Update the UI with Results
        document.getElementById('predPrice').innerText = `$${result.predicted_price.toFixed(2)}`;
        
        const signalEl = document.getElementById('predSignal');
        signalEl.innerText = result.signal;
        signalEl.className = result.signal === "BUY" ? "signal-buy" : (result.signal === "SELL" ? "signal-sell" : "");

        document.getElementById('predConfidence').innerText = result.confidence;

        // Add the predicted point to the chart
        addPredictionToChart(result.predicted_price);

    } catch (error) {
        alert("Prediction failed. Is the Render backend awake? (It sleeps after 15 mins of inactivity)");
        console.error(error);
    } finally {
        btn.disabled = false;
        btn.innerText = "Generate Prediction";
        spinner.classList.add('hidden');
    }
}

// 4. Plotting Logic
function plotChart(timestamps, prices) {
    const dates = timestamps.map(t => new Date(t * 1000));
    
    const trace1 = {
        x: dates,
        y: prices,
        type: 'scatter',
        mode: 'lines',
        name: 'AAPL History',
        line: { color: '#00b4d8' }
    };

    const layout = {
        paper_bgcolor: '#161b22',
        plot_bgcolor: '#161b22',
        font: { color: '#c9d1d9' },
        margin: { t: 20, b: 40, l: 40, r: 20 },
        xaxis: { showgrid: false },
        yaxis: { gridcolor: '#30363d' }
    };

    Plotly.newPlot('stockChart', [trace1], layout);
}

function addPredictionToChart(predPrice) {
    // Get the last date and add 1 day
    const lastDate = new Date(); 
    // Add a marker for the prediction
    const update = {
        x: [[lastDate]], // Simple logic for demo, ideally calculated from last timestamp
        y: [[predPrice]],
        name: 'AI Prediction',
        mode: 'markers',
        marker: { color: '#2ea043', size: 12 }
    };
    
    Plotly.addTraces('stockChart', update);

}
