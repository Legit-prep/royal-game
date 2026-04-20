import { useEffect, useState } from 'react'
import { X, Trophy, Globe, Swords, Target, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient' // Make sure this path is correct!

export default function UserProfile({ user, isFriend, onClose }: any) {
  const [gameStats, setGameStats] = useState<any[]>([])
  const [totalPoints, setTotalPoints] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchRealData = async () => {
      try {
        // Fetch actual data from the game_stats table we created
        const { data, error } = await supabase
          .from('game_stats')
          .select('*')
          .eq('user_id', user.id)
          .order('points', { ascending: false }); // Highest points first

        if (error) throw error;

        if (data) {
          setGameStats(data);
          // Calculate total points across all games for a "Global Score"
          const total = data.reduce((sum, game) => sum + game.points, 0);
          setTotalPoints(total > 0 ? total : 1000); // Base score of 1000 if new
        }
      } catch (error) {
        console.error("Error fetching real stats:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRealData();
  }, [user.id]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-[#0f172a] border border-slate-700 w-full max-w-md rounded-[2rem] overflow-hidden shadow-2xl relative">
        
        {/* Cover Banner & Close Button */}
        <div className="h-32 bg-gradient-to-r from-indigo-600 to-purple-600 relative">
            <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 rounded-full text-white backdrop-blur-md transition">
                <X className="w-5 h-5" />
            </button>
        </div>

        {/* Avatar & Header Info */}
        <div className="px-6 pb-6 relative">
            <div className="flex justify-between items-end -mt-12 mb-4">
                <div className="relative">
                    <img 
                        src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`} 
                        alt="Profile" 
                        className="w-24 h-24 rounded-2xl border-4 border-[#0f172a] object-cover bg-slate-800"
                    />
                    <div className="absolute -bottom-2 -right-2 bg-emerald-500 w-5 h-5 rounded-full border-2 border-[#0f172a]" title="Online"></div>
                </div>
                <div className="text-right">
                    <p className="text-indigo-400 font-mono text-xs font-bold bg-indigo-500/10 px-2 py-1 rounded-lg border border-indigo-500/20">UID: {user.id.substring(0,8).toUpperCase()}</p>
                </div>
            </div>

            <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-black text-white">{user.display_name}</h2>
            </div>
            
            <div className="flex items-center text-amber-400 font-bold text-sm bg-amber-400/10 w-fit px-3 py-1 rounded-full border border-amber-400/20 mb-6 shadow-inner shadow-amber-400/10">
                <Globe className="w-4 h-4 mr-1.5" /> Total Rating: {totalPoints.toLocaleString()}
            </div>

            {/* Game Stats Grid */}
            <h3 className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-3 px-1">Real Arena Statistics</h3>
            
            <div className="space-y-3 min-h-[150px]">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-32 opacity-50">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
                        <p className="text-xs font-bold text-slate-400">SYNCING LIVE DATA...</p>
                    </div>
                ) : gameStats.length === 0 ? (
                    <div className="bg-[#1e293b] border border-slate-700/50 rounded-2xl p-6 text-center">
                        <p className="text-slate-400 font-medium text-sm">This warrior hasn't entered the arena yet.</p>
                    </div>
                ) : (
                    gameStats.map(stat => {
                        const totalMatches = stat.wins + stat.losses + stat.draws;
                        const winRate = totalMatches > 0 ? Math.round((stat.wins / totalMatches) * 100) : 0;
                        
                        return (
                            <div key={stat.game_id} className="bg-[#1e293b] border border-slate-700/50 rounded-2xl p-4 flex items-center justify-between hover:bg-slate-800 transition cursor-default">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                                        <Trophy className="w-5 h-5 text-indigo-400" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-white text-sm uppercase">{stat.game_id}</p>
                                        <p className="text-xs font-medium text-slate-400">{totalMatches} Matches Played</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-black text-amber-400 text-lg leading-none">{stat.points} <span className="text-[10px] text-amber-400/50">PTS</span></p>
                                    <p className={`text-xs font-bold mt-1 flex items-center justify-end gap-1 ${winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        <Target className="w-3 h-3"/> {winRate}% Win
                                    </p>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
      </div>
    </div>
  )
}