"""MolTrade yfinance microservice — thin FastAPI wrapper around yfinance."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf

app = FastAPI(title="MolTrade yfinance Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/quote/{symbol}")
def get_quote(symbol: str):
    ticker = yf.Ticker(symbol.upper())
    info = ticker.fast_info

    try:
        price = info.last_price
        prev_close = info.previous_close
        change = price - prev_close if prev_close else 0
        change_pct = (change / prev_close * 100) if prev_close else 0

        return {
            "symbol": symbol.upper(),
            "price": round(price, 4),
            "change": round(change, 4),
            "changePercent": round(change_pct, 4),
            "volume": info.last_volume or 0,
            "high": round(info.day_high, 4) if info.day_high else price,
            "low": round(info.day_low, 4) if info.day_low else price,
            "open": round(info.open, 4) if info.open else price,
            "previousClose": round(prev_close, 4) if prev_close else 0,
            "timestamp": str(info.last_price),  # placeholder
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not fetch quote for {symbol}: {e}")


@app.get("/history/{symbol}")
def get_history(symbol: str, period: str = "1y", interval: str = "1d"):
    ticker = yf.Ticker(symbol.upper())
    df = ticker.history(period=period, interval=interval)

    if df.empty:
        raise HTTPException(status_code=404, detail=f"No history for {symbol}")

    bars = []
    for date, row in df.iterrows():
        bars.append({
            "date": str(date.date()) if hasattr(date, "date") else str(date),
            "open": round(row["Open"], 4),
            "high": round(row["High"], 4),
            "low": round(row["Low"], 4),
            "close": round(row["Close"], 4),
            "volume": int(row["Volume"]),
        })

    return bars


@app.get("/info/{symbol}")
def get_info(symbol: str):
    ticker = yf.Ticker(symbol.upper())
    info = ticker.info

    if not info or "symbol" not in info:
        raise HTTPException(status_code=404, detail=f"No info for {symbol}")

    return {
        "symbol": info.get("symbol"),
        "name": info.get("longName") or info.get("shortName"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "marketCap": info.get("marketCap"),
        "peRatio": info.get("trailingPE"),
        "eps": info.get("trailingEps"),
        "dividendYield": info.get("dividendYield"),
        "beta": info.get("beta"),
        "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh"),
        "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow"),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8100)
