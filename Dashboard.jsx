import React, { useState, useEffect } from 'react';
import { Activity, AlertTriangle, Play, ShieldCheck, User, MessageSquare, RefreshCw, Lightbulb, ClipboardList, Info, BarChart3, Clock, Send, Zap, ChevronRight, LayoutDashboard, Target, ShieldAlert, Settings, TrendingUp, History, Download, Users, Plus, X, Globe, Trash2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, AreaChart, Area, PieChart, Pie, Cell, ComposedChart, Bar, Legend } from 'recharts';

const API_BASE = "http://localhost:8000";

const MetricTooltip = ({ text }) => (
  <div className="group relative inline-block ml-1.5 align-middle">
    <Info size={13} className="text-slate-300 hover:text-indigo-500 cursor-help transition-colors" />
    <div className="invisible group-hover:visible absolute z-50 w-56 p-3 mt-2 text-[11px] leading-relaxed text-white bg-slate-800 rounded-xl shadow-2xl -left-2 top-full transition-all opacity-0 group-hover:opacity-100">
      {text}
      <div className="absolute w-2 h-2 bg-slate-800 rotate-45 -top-1 left-3"></div>
    </div>
  </div>
);

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
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, agentId: null, agentName: '' });
  const [agents, setAgents] = useState([]);
  const [newAgent, setNewAgent] = useState({ name: '', persona: { gullibility: 0.5, influence: 0.5, interests: '', political_bias: 'Neutral' } });
  const [trends, setTrends] = useState([]);
  const [loadingTrends, setLoadingTrends] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const res = await fetch(`${API_BASE}/agents`);
      if (res.ok) setAgents(await res.json());
    } catch (err) { console.error("Failed to fetch agents:", err); }
  };

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

  // チャート用データの作成
  const getChartData = () => {
    if (details.length === 0) return [];
    const roundsArr = [...new Set(details.map(d => d.round))].sort((a, b) => a - b);
    
    let cumulativeSpread = 0;
    return roundsArr.map(r => {
      const roundDetails = details.filter(d => d.round === r);
      cumulativeSpread += roundDetails.length;
      return {
        name: `R${r}`,
        spread: roundDetails.length,
        total: cumulativeSpread,
      };
    });
  };

  // 抑制効果（抑制率）の計算
  const getSuppressionRate = () => {
    // 対策内容が入力されていない場合は計算しない
    if (!summary || !summary.intervention_impact || !rounds || !interventionContent) return null;
    const intRound = parseInt(interventionRound);
    
    // ラウンド1での介入は比較対象（介入前）がないため、計算不可として特殊な値を返す
    if (intRound === 1) return "IMMEDIATE";

    const totalRounds = parseInt(rounds);
    
    const preRounds = intRound - 1;
    const postRounds = totalRounds - intRound + 1;
    
    if (preRounds <= 0 || postRounds <= 0) return null;
    
    const preAvg = summary.intervention_impact.pre_spread_count / preRounds;
    const postAvg = summary.intervention_impact.post_spread_count / postRounds;
    
    if (preAvg === 0) return 0;
    return ((preAvg - postAvg) / preAvg * 100).toFixed(1);
  };

  // シミュレーション結果をJSONとしてエクスポート
  const exportResultsJSON = () => {
    if (!summary || details.length === 0) return;
    const exportData = {
      metadata: {
        session_id: sessionId,
        exported_at: new Date().toISOString(),
        config: { scenario: news || scenario, rounds, interventionContent, interventionRound }
      },
      summary,
      ai_analysis: aiAnalysis,
      timeline: details
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `social-risk-report-${sessionId.slice(0, 8)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleAddAgent = async () => {
    if (!newAgent.name) return;
    try {
      const payload = {
        agent_id: `agent_${Math.random().toString(36).substr(2, 9)}`,
        name: newAgent.name,
        persona: {
          ...newAgent.persona,
          interests: newAgent.persona.interests.split(',').map(i => i.trim())
        },
        following: []
      };
      const res = await fetch(`${API_BASE}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        fetchAgents();
        setNewAgent({ name: '', persona: { gullibility: 0.5, influence: 0.5, interests: '', political_bias: 'Neutral' } });
      }
    } catch (err) { console.error(err); }
  };

  const handleDeleteAgent = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/agents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchAgents();
        setDeleteConfirm({ show: false, agentId: null, agentName: '' });
      }
    } catch (err) { console.error(err); }
  };

  const fetchTrends = async () => {
    setLoadingTrends(true);
    try {
      const res = await fetch(`${API_BASE}/trends`);
      if (res.ok) {
        const data = await res.json();
        setTrends(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTrends(false);
    }
  };

  // 感情カテゴリごとの色を定義
  const CATEGORY_COLORS = {
    "Positive": '#10b981', // Green
    "Negative": '#ef4444', // Red
    "Neutral": '#94a3b8',  // Slate/Gray
    "Uncertain": '#f59e0b', // Orange
    "Unknown": '#64748b' // Fallback color
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
                Social Risk Simulator
              </h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Vulnerability Assessment</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowAgentModal(true)}
              className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 px-4 py-2 rounded-lg border border-slate-200 shadow-sm transition-all active:scale-95"
            >
              <Users size={14} />
              Manage Agents ({agents.length})
            </button>
            {summary && !polling && (
              <button 
                onClick={exportResultsJSON}
                className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 px-4 py-2 rounded-lg border border-slate-200 shadow-sm transition-all active:scale-95"
              >
                <Download size={14} />
                Export Data
              </button>
            )}
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
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase">Custom News Content</label>
                    <button 
                      onClick={fetchTrends}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                    >
                      <Globe size={12} /> Fetch Trends
                    </button>
                  </div>
                  <textarea 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 h-28 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none"
                    value={news} onChange={(e) => setNews(e.target.value)}
                    placeholder="Enter custom rumor text..."
                  />
                  {trends.length > 0 && (
                    <div className="mt-2 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
                      <p className="text-[10px] font-bold text-indigo-400 uppercase mb-2">Live Hot Topics</p>
                      <div className="flex flex-wrap gap-1.5">
                        {trends.map(t => (
                          <button 
                            key={t.id} onClick={() => {setNews(t.topic); setTrends([]);}}
                            className="text-[10px] bg-white border border-indigo-100 text-indigo-700 px-2 py-1 rounded-md hover:bg-indigo-600 hover:text-white transition-colors"
                          >
                            {t.topic}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
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
            {/* 統計概要カード */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {summary && (
                <>
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-1 flex items-center">
                      Vulnerability Score
                      <MetricTooltip text="ネットワーク全体のデマ耐性を示す指標。リツイートや返信の数、エージェントの影響力を考慮して算出されます。" />
                    </p>
                    <p className={`text-3xl font-bold ${summary.vulnerability_score > 60 ? 'text-rose-600' : 'text-amber-500'}`}>
                      {summary.vulnerability_score}%
                    </p>
                    <div className="w-full bg-slate-100 h-1.5 mt-4 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-1000 ${summary.vulnerability_score > 60 ? 'bg-rose-500' : 'bg-amber-500'}`} style={{width: `${summary.vulnerability_score}%`}}></div>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-1 flex items-center">
                      Risk Level
                      <MetricTooltip text="脆弱性スコアに基づき、情報の拡散リスクを定性的に評価したものです。" />
                    </p>
                    <div className={`text-xl font-bold flex items-center gap-2 mt-2 ${summary.risk_level === 'CRITICAL' ? 'text-rose-600' : 'text-amber-500'}`}>
                      <AlertTriangle size={18} /> {summary.risk_level}
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-1 flex items-center">
                      Suppression Effect
                      <MetricTooltip text="公式声明などの介入が、1ラウンドあたりの平均拡散数を何%減少させたかを示します。マイナスは拡散が加速したことを意味します。" />
                    </p>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className={`text-2xl font-bold ${getSuppressionRate() === "IMMEDIATE" ? "text-indigo-600" : parseFloat(getSuppressionRate()) > 0 ? 'text-emerald-600' : parseFloat(getSuppressionRate()) < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                        {getSuppressionRate() === "IMMEDIATE" ? "N/A" : getSuppressionRate() !== null ? `${getSuppressionRate()}%` : '--'}
                      </span>
                      {getSuppressionRate() !== null && (
                        <span className="text-[10px] text-slate-400 font-medium">
                          {getSuppressionRate() === "IMMEDIATE" ? "Immediate Action" : parseFloat(getSuppressionRate()) >= 0 ? 'Suppressed' : 'Increased'}
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1 uppercase">
                      {summary.intervention_impact?.pre_spread_count || 0} pre
                      <span className="mx-1">→</span>
                      {summary.intervention_impact?.post_spread_count || 0} post
                    </p>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-1 flex items-center">
                      Top Spreader
                      <MetricTooltip text="このセッションで最も拡散（リツイート）に寄与した影響力の高いエージェントです。" />
                    </p>
                    {summary.top_spreaders?.[0] ? (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-slate-700 font-bold text-sm truncate">@{summary.top_spreaders[0].name}</span>
                        <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-bold">{summary.top_spreaders[0].count} RT</span>
                      </div>
                    ) : (
                      <p className="text-slate-300 text-xs italic mt-2">None detected</p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* アナリティクスセクション */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 拡散推移チャート */}
              {details.length > 0 && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h2 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2 uppercase tracking-wider relative">
                    <TrendingUp size={16} className="text-indigo-500" /> 
                    Spread Analytics
                    <MetricTooltip text="累積拡散数（面グラフ）と、各ラウンドでの拡散の勢い（棒グラフ）の推移を分析します。" />
                  </h2>
                  <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={getChartData()}>
                        <defs>
                          <linearGradient id="colorSpread" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fontSize: 10, fill: '#94a3b8'}}
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fontSize: 10, fill: '#94a3b8'}}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '12px', 
                            border: 'none', 
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            fontSize: '12px'
                          }} 
                        />
                        {interventionContent && (
                          <ReferenceLine 
                            x={`R${interventionRound}`} 
                            stroke="#10b981" 
                            strokeDasharray="3 3"
                            label={{ 
                              value: 'Intervention', 
                              position: 'insideTopRight', 
                              fill: '#059669', 
                              fontSize: 10,
                              fontWeight: 'bold'
                            }} 
                          />
                        )}
                        <Area type="monotone" dataKey="total" stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#colorSpread)" name="Cumulative Spread" />
                        <Bar dataKey="spread" barSize={24} fill="#94a3b8" radius={[4, 4, 0, 0]} name="New Spread per Round" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[10px] text-center text-slate-400 mt-4 italic">The bar chart (Round Spread) shows the velocity change before and after the intervention.</p>
                </div>
              )}

              {/* 感情分析円グラフ */}
              {summary?.sentiment_analysis && Object.keys(summary.sentiment_analysis).length > 0 && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h2 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2 uppercase tracking-wider relative">
                    <Activity size={16} className="text-rose-500" /> 
                    Sentiment Distribution
                    <MetricTooltip text="ニュースに対する人々の反応を感情カテゴリで分類したものです。ネットワーク内の心理状態を把握します。" />
                  </h2>
                  <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={Object.entries(summary.sentiment_analysis).map(([name, value]) => ({ name, value }))}
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                        >
                          {Object.entries(summary.sentiment_analysis).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry[0]] || CATEGORY_COLORS["Unknown"]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '12px', 
                            border: 'none', 
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            fontSize: '12px'
                          }}
                        />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

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

      {/* Agent Management Modal */}
      {showAgentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Users className="text-indigo-600" size={20} />
                <h2 className="text-lg font-bold text-slate-800">Agent Persona Settings</h2>
              </div>
              <button onClick={() => setShowAgentModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 h-[500px] overflow-y-auto">
              {/* List Section */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Agents</h3>
                <div className="space-y-2">
                  {agents.map((agent) => (
                    <div key={agent.agent_id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-800">@{agent.name}</p>
                        <p className="text-[10px] text-slate-400">Gullibility: {agent.persona.gullibility} | Influence: {agent.persona.influence}</p>
                      </div>
                      <button 
                        onClick={() => setDeleteConfirm({ show: true, agentId: agent.agent_id, agentName: agent.name })}
                        className="text-slate-300 hover:text-rose-500 p-2 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Section */}
              <div className="space-y-5 bg-indigo-50/30 p-5 rounded-2xl border border-indigo-100/50">
                <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                  <Plus size={14} /> Create New Persona
                </h3>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                      Agent Name <span className="text-rose-500">*</span>
                    </label>
                    <input 
                      type="text" placeholder="e.g. Satoshi" 
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                      value={newAgent.name} onChange={(e) => setNewAgent({...newAgent, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Gullibility (0.0 - 1.0)</label>
                    <input 
                      type="range" min="0" max="1" step="0.1" className="w-full accent-indigo-600"
                      value={newAgent.persona.gullibility} onChange={(e) => setNewAgent({...newAgent, persona: {...newAgent.persona, gullibility: parseFloat(e.target.value)}})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Influence (0.0 - 1.0)</label>
                    <input 
                      type="range" min="0" max="1" step="0.1" className="w-full accent-indigo-600"
                      value={newAgent.persona.influence} onChange={(e) => setNewAgent({...newAgent, persona: {...newAgent.persona, influence: parseFloat(e.target.value)}})}
                    />
                  </div>
                  <textarea 
                    placeholder="Interests (comma separated: AI, Tech, Politics)" 
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm h-20 resize-none outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={newAgent.persona.interests} onChange={(e) => setNewAgent({...newAgent, persona: {...newAgent.persona, interests: e.target.value}})}
                  />
                  <button 
                    onClick={handleAddAgent}
                    disabled={!newAgent.name}
                    className={`w-full py-3 text-white rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 ${!newAgent.name ? 'bg-slate-300 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}
                  >
                    Add Agent
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm.show && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 border border-slate-200">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold">Delete Agent?</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-slate-900">@{deleteConfirm.agentName}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeleteConfirm({ show: false, agentId: null, agentName: '' })}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleDeleteAgent(deleteConfirm.agentId)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-sm hover:bg-rose-700 shadow-lg shadow-rose-200 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;