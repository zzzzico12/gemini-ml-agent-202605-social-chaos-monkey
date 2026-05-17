import React, { useState, useEffect } from 'react';
import { Activity, AlertTriangle, Play, ShieldCheck, User, MessageSquare, RefreshCw } from 'lucide-react';

const API_BASE = "http://localhost:8000";

const Dashboard = () => {
  const [news, setNews] = useState('');
  const [scenario, setScenario] = useState('product_safety');
  const [rounds, setRounds] = useState(3);
  const [sessionId, setSessionId] = useState(null);
  const [summary, setSummary] = useState(null);
  const [details, setDetails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  const runSimulation = async () => {
    setLoading(true);
    try {
      const payload = news ? { news_content: news, rounds } : { scenario_key: scenario, rounds };
      const res = await fetch(`${API_BASE}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setSessionId(data.session_id);
      
      // Implement polling to handle async delay from Pub/Sub worker
      let attempts = 0;
      const poll = async () => {
        const hasResults = await fetchResults(data.session_id);
        if (!hasResults && attempts < 20) {
          attempts++;
          setPolling(true);
          setTimeout(poll, 3000); // Retry every 3 seconds
        } else {
          setLoading(false);
          setPolling(false);
        }
      };
      poll();
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const fetchResults = async (id) => {
    const [sumRes, detRes] = await Promise.all([
      fetch(`${API_BASE}/simulation/${id}/summary`),
      fetch(`${API_BASE}/simulation/${id}`)
    ]);

    // If results are not yet available (404), return false to trigger next poll
    if (sumRes.status === 404 || detRes.status === 404) return false;

    if (sumRes.ok) setSummary(await sumRes.json());
    if (detRes.ok) setDetails(await detRes.json());
    
    if (sumRes.ok || detRes.ok) setLoading(false); // 最初のデータが来たらローディング解除
    return sumRes.ok && detRes.ok;
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8 font-sans">
      <header className="mb-10 flex justify-between items-center border-b border-slate-700 pb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-rose-500">
            Social Chaos Monkey
          </h1>
          <p className="text-slate-400 mt-2">Vulnerability Assessment Platform</p>
        </div>
        <div className="flex gap-4">
          <ShieldCheck className="text-emerald-400" size={32} />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* コントロールパネル */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl h-fit">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Play size={20} className="text-orange-400" /> Start Stress Test
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Scenario Preset</label>
              <select 
                className="w-full bg-slate-900 border border-slate-600 rounded-lg p-2"
                value={scenario} onChange={(e) => {setScenario(e.target.value); setNews('');}}
              >
                <option value="product_safety">Product Safety Hoax</option>
                <option value="market_manipulation">Market Manipulation</option>
                <option value="disaster_panic">Disaster Panic</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Custom News Content</label>
              <textarea 
                className="w-full bg-slate-900 border border-slate-600 rounded-lg p-2 h-24 text-sm"
                value={news} onChange={(e) => setNews(e.target.value)}
                placeholder="Enter custom rumor text..."
              />
            </div>
            <button 
              onClick={runSimulation}
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-slate-700 text-white font-bold py-3 rounded-lg transition-all flex justify-center items-center gap-2"
            >
              {loading ? <RefreshCw className="animate-spin" /> : polling ? "Analyzing..." : "Inject Chaos"}
            </button>
          </div>
        </div>

        {/* メトリクス表示 */}
        <div className="lg:col-span-2 space-y-8">
          {summary && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 text-center">
                <p className="text-slate-400 text-sm uppercase font-bold tracking-widest">Vulnerability Score</p>
                <p className={`text-5xl font-black mt-2 ${summary.vulnerability_score > 60 ? 'text-rose-500' : 'text-orange-400'}`}>
                  {summary.vulnerability_score}%
                </p>
              </div>
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 text-center">
                <p className="text-slate-400 text-sm uppercase font-bold tracking-widest">Risk Level</p>
                <p className={`text-3xl font-black mt-4 flex items-center justify-center gap-2 ${summary.risk_level === 'CRITICAL' ? 'text-rose-600' : 'text-yellow-400'}`}>
                  <AlertTriangle size={24} /> {summary.risk_level}
                </p>
              </div>
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                <p className="text-slate-400 text-sm uppercase font-bold mb-4 tracking-widest">Top Spreaders</p>
                {summary.top_spreaders?.map((s, i) => (
                  <div key={i} className="flex justify-between items-center text-sm mb-2">
                    <span className="text-slate-200">@{s.name}</span>
                    <span className="text-orange-400 font-mono">{s.count} RT</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* タイムライン */}
          <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 min-h-[400px]">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Activity size={20} className="text-sky-400" /> Propagation Timeline
            </h2>
            {details.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-slate-500 italic">
                Waiting for injection results...
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {details.map((item, i) => (
                  <div key={i} className={`p-4 rounded-xl border ${item.action === 'RETWEET' ? 'bg-orange-950/20 border-orange-500/30' : 'bg-slate-900 border-slate-700'}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <User size={16} className="text-slate-400" />
                        <span className="font-bold text-orange-300">{item.agent_name}</span>
                        <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-400">Round {item.round}</span>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded ${
                        item.action === 'RETWEET' ? 'bg-orange-500 text-white' : 
                        item.action === 'REPLY' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-400'
                      }`}>
                        {item.action}
                      </span>
                    </div>
                    {item.reply_content && (
                      <p className="text-slate-200 text-sm mb-3 pl-4 border-l-2 border-slate-600 italic">
                        "{item.reply_content}"
                      </p>
                    )}
                    <div className="flex items-start gap-2 bg-slate-950/50 p-2 rounded text-xs text-slate-400">
                      <MessageSquare size={14} className="mt-0.5 flex-shrink-0" />
                      <p><span className="text-slate-500 uppercase font-bold mr-1">Inner Thought:</span>{item.emotion}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;