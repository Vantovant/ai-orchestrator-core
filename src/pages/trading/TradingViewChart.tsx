import { useEffect, useRef } from "react";

export default function TradingViewChart({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !symbol) return;
    el.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
    const isLight = document.documentElement.classList.contains("light");
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true, symbol, interval: "D", timezone: "Africa/Johannesburg",
      theme: isLight ? "light" : "dark", style: "1", locale: "en", allow_symbol_change: true,
      ...(bg ? { backgroundColor: `hsl(${bg.split(" ").join(", ")})` } : {}),
      support_host: "https://www.tradingview.com",
    });
    el.appendChild(script);
    return () => { el.innerHTML = ""; };
  }, [symbol]);
  return <div ref={ref} className="tradingview-widget-container h-[360px] sm:h-[480px] w-full rounded-md overflow-hidden border border-border" />;
}
