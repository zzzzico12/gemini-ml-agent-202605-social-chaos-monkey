import React, { useState, useEffect } from 'react';
import { Activity, AlertTriangle, Play, ShieldCheck, User, MessageSquare, RefreshCw, Lightbulb, ClipboardList, Info, BarChart3, Clock, Send, Zap, ChevronRight, LayoutDashboard, Target, ShieldAlert, Settings, TrendingUp } from 'lucide-react';

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
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [interventionContent, setInterventionContent] = useState('');
  const [interventionRound, setInterventionRound] = useState(2);

  const runSimulation = async () => {
    setLoading(true);
    setAiAnalysis(null);
    setDetails([]);
    setSummary(null);
    try {
      const payload = {
        ...(news ? { news_content: news } : { scenario_key: scenario }),
        rounds: parseInt(rounds),
        intervention_content: interventionContent || null,
        intervention_round: interventionContent ? parseInt(interventionRound) : null
      };
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
        const result = await fetchResults(data.session_id);
        attempts++;
        
        if (result && (result.isComplete || attempts >= 40)) {
          setLoading(false);
          setPolling(false);
          fetchAiAnalysis(data.session_id); // ポーリング終了後にAI分析を開始
        } else {
          setPolling(true);
          setTimeout(poll, 3000); // 完了するまで3秒おきに継続
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

    if (sumRes.status === 404) return { isComplete: false, hasData: false };

    const summaryData = await sumRes.json();
    const detailsData = await detRes.json();

    setSummary(summaryData);
    setDetails(detailsData);

    // 1件でもデータがあればローディングを少し解除するがポーリングは続ける
    if (detailsData.length > 0) setLoading(false);

    return { 
      isComplete: summaryData.status === 'completed', 
      hasData: detailsData.length > 0 
    };
  };

  const fetchAiAnalysis = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/simulation/${id}/analysis`);
      if (res.ok) setAiAnalysis(await res.json());
    } catch (err) {
      console.error("AI Analysis failed:", err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100">
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <ShieldCheck className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Social Chaos Monkey
              </h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Vulnerability Assessment</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {polling && (
              <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100 uppercase tracking-widest">
                <RefreshCw size={12} className="animate-spin" /> Live Tracking
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* 左側：コントロールパネル */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2 uppercase tracking-wider">
                <Zap size={16} className="text-amber-500" /> Simulation Config
              </h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Scenario Preset</label>
                  <select 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    value={scenario} onChange={(e) => {setScenario(e.target.value); setNews('');}}
                  >
                    <option value="product_safety">Product Safety Hoax</option>
                    <option value="market_manipulation">Market Manipulation</option>
                    <option value="disaster_panic">Disaster Panic</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Custom News Content</label>
                  <textarea 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 h-28 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none"
                    value={news} onChange={(e) => setNews(e.target.value)}
                    placeholder="Enter custom rumor text..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Rounds</label>
                  <input 
                    type="number" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    value={rounds} onChange={(e) => setRounds(e.target.value)}
                    min="1" max="10"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold text-slate-800 mb-4 flex items-center gap-2 uppercase">
                    <ShieldCheck size={14} className="text-emerald-500" /> Intervention Patch
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase">Official Statement</label>
                      <textarea 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 h-20 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none"
                        value={interventionContent} onChange={(e) => setInterventionContent(e.target.value)}
                        placeholder="e.g. This is a false claim..."
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase">Injection Round</label>
                      <input 
                        type="number"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm"
                        value={interventionRound} onChange={(e) => setInterventionRound(e.target.value)}
                        min="1" max={rounds}
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={runSimulation}
                  disabled={loading}
                  className={`w-full mt-4 py-4 rounded-xl font-bold text-sm transition-all flex justify-center items-center gap-3 shadow-sm ${
                    loading || polling ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-800 active:scale-95 text-white'
                  }`}
                >
                  {loading ? <RefreshCw className="animate-spin" size={18} /> : polling ? "Processing..." : "Launch Simulation"}
                </button>
              </div>
            </div>
          </div>

          {/* 右側：メトリクスとタイムライン */}
          <div className="lg:col-span-8 space-y-6">
            {summary && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-1">Vulnerability Score</p>
                  <p className={`text-4xl font-bold ${summary.vulnerability_score > 60 ? 'text-rose-600' : 'text-amber-500'}`}>
                    {summary.vulnerability_score}%
                  </p>
                  <div className="w-full bg-slate-100 h-1.5 mt-4 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-1000 ${summary.vulnerability_score > 60 ? 'bg-rose-500' : 'bg-amber-500'}`} style={{width: `${summary.vulnerability_score}%`}}></div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-1">Risk Level</p>
                  <div className={`text-2xl font-bold flex items-center gap-2 mt-2 ${summary.risk_level === 'CRITICAL' ? 'text-rose-600' : 'text-amber-500'}`}>
                    <AlertTriangle size={20} /> {summary.risk_level}
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-3">Top Spreaders</p>
                  <div className="space-y-2">
                    {summary.top_spreaders?.slice(0, 2).map((s, i) => (
                      <div key={i} className="flex justify-between items-center text-xs bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="text-slate-700 font-bold truncate">@{s.name}</span>
                        <span className="text-indigo-600 font-bold">{s.count} RT</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {aiAnalysis && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100">
                  <div className="flex items-center gap-2 mb-4 text-indigo-700">
                    <Lightbulb size={18} />
                    <h3 className="text-sm font-bold uppercase tracking-wide">Analysis</h3>
                  </div>
                  <div className="text-slate-600 text-sm leading-relaxed space-y-2">
                    {aiAnalysis.situation_summary.split('。').map((s, i) => s && <p key={i}>・{s}。</p>)}
                  </div>
                </div>
                <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100">
                  <div className="flex items-center gap-2 mb-4 text-emerald-700">
                    <ClipboardList size={18} />
                    <h3 className="text-sm font-bold uppercase tracking-wide">Recommendations</h3>
                  </div>
                  <div className="text-slate-600 text-sm leading-relaxed space-y-2">
                    {aiAnalysis.strategic_recommendations.split('。').map((s, i) => s && <p key={i}>✓ {s}。</p>)}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm min-h-[500px]">
              <h2 className="text-sm font-bold text-slate-800 mb-8 flex items-center gap-2 uppercase tracking-wider border-b border-slate-100 pb-4">
                <Activity size={16} className="text-indigo-500" /> Propagation Timeline
              </h2>
              
              {details.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-4">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center">
                    <Send size={20} />
                  </div>
                  <p className="text-sm font-medium italic">Waiting for injection results...</p>
                </div>
              ) : (
                <div className="space-y-12 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
                  {[...new Set(details.map(d => d.round))].sort((a,b) => a-b).map(roundNum => (
                    <div key={roundNum} className="relative pl-6 border-l-2 border-slate-100">
                      <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-indigo-500"></div>
                      <div className="mb-6">
                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                          Round {roundNum}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                        {details.filter(d => d.round === roundNum).map((item, i) => (
                          <div key={i} className="group p-5 rounded-xl border border-slate-100 bg-white hover:border-indigo-200 transition-all shadow-sm hover:shadow-md">
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs border border-slate-200">
                                  {item.agent_name.substring(0, 2)}
                                </div>
                                <div>
                                  <span className="block font-bold text-slate-800 text-sm">@{item.agent_name}</span>
                                  <span className="text-[10px] text-slate-400 font-medium">Agent Activity</span>
                                </div>
                              </div>
                              <span className={`text-[9px] font-bold px-3 py-1 rounded-full border tracking-wider uppercase ${
                                item.action === 'RETWEET' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                item.action === 'REPLY' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-50 text-slate-500 border-slate-200'
                              }`}>
                                {item.action}
                              </span>
                            </div>
                            {item.reply_content && (
                              <p className="text-slate-700 text-sm font-medium mb-4 leading-relaxed pl-3 border-l-2 border-slate-200">
                                {item.reply_content}
                              </p>
                            )}
                            <div className="flex items-start gap-2 bg-slate-50 p-3 rounded-lg text-[11px] text-slate-500 border border-slate-100">
                              <Info size={14} className="mt-0.5 flex-shrink-0 text-slate-400" />
                              <p><span className="text-slate-800 font-bold uppercase mr-1 text-[9px]">Logic:</span>{item.emotion}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;