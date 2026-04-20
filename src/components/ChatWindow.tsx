'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { io, Socket } from 'socket.io-client'
import { ARCADE_GAMES } from '../lib/arcadeGames'
import { ChevronLeft, Trash2, Send, CheckSquare, CornerDownRight, Smile, X, Timer, Gamepad2 } from 'lucide-react'
import UserProfile from './UserProfile'

// --- SECURE SUPER ENGINE URL ---
const SOCKET_URL = 'https://engine.theroyalfoundation.org.in'

export default function ChatWindow({ activeChat, authUser, onClose, showToast }: any) {
    const [messages, setMessages] = useState<any[]>([])
    const [chatInput, setChatInput] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set())
    const [replyingTo, setReplyingTo] = useState<any | null>(null)
    const [showGameMenu, setShowGameMenu] = useState(false)
    const [showProfile, setShowProfile] = useState(false)
    
    // Guard against Hydration Mismatch
    const [hasMounted, setHasMounted] = useState(false);
    
    // Iframe Overlay State
    const [activeArenaUrl, setActiveArenaUrl] = useState<string | null>(null)
    const [activeChallengeMsgId, setActiveChallengeMsgId] = useState<string | null>(null)
    
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const socketRef = useRef<Socket | null>(null)

    const roomName = `chat_${[authUser?.id, activeChat?.id].sort().join('_')}`

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    // Set mounted state on load
    useEffect(() => {
        setHasMounted(true);
    }, []);

    // --- GAME ENGINE LISTENER ---
    useEffect(() => {
        if (!authUser) return;

        const handleGameMessage = async (event: MessageEvent) => {
            if (event.origin !== 'https://theroyalfoundation.org.in') return;

            const data = event.data;

            if (data?.type === 'RETURN_TO_HUB') {
                setActiveArenaUrl(null);
            }

            if (data?.type === 'GAME_OVER') {
                console.log(`[SYSTEM] Match Finished: ${data.result} in ${data.game}`);
                await processGameResult(authUser.id, data.game, data.result);

                if (activeChallengeMsgId) {
                    const msg = messages.find(m => m.id === activeChallengeMsgId);
                    if (msg) {
                        try {
                            const parsed = JSON.parse(msg.content);
                            if (data.result === 'win') {
                                updateChallengeStatus(activeChallengeMsgId, parsed, 'completed', authUser.id);
                            } else if (data.result === 'draw' && msg.sender_id === authUser.id) {
                                updateChallengeStatus(activeChallengeMsgId, parsed, 'draw');
                            }
                        } catch (e) {}
                    }
                }
                setActiveArenaUrl(null);
            }
        };

        window.addEventListener('message', handleGameMessage);
        return () => window.removeEventListener('message', handleGameMessage);
    }, [authUser, activeChallengeMsgId, messages]);

    const processGameResult = async (userId: string, gameId: string, result: 'win' | 'lose' | 'draw') => {
        try {
            let { data: stats, error: fetchError } = await supabase
                .from('game_stats')
                .select('*')
                .eq('user_id', userId)
                .eq('game_id', gameId)
                .single();

            if (fetchError && fetchError.code === 'PGRST116') {
                const { data: newStats, error: insertError } = await supabase
                    .from('game_stats')
                    .insert([{ user_id: userId, game_id: gameId, points: 1000 }])
                    .select()
                    .single();
                if (insertError) throw insertError;
                stats = newStats;
            } else if (fetchError) throw fetchError;

            let newPoints = stats.points;
            let newWins = stats.wins;
            let newLosses = stats.losses;
            let newDraws = stats.draws;

            if (result === 'win') {
                newPoints += 25;
                newWins += 1;
                showToast(`Victory! +25 Points.`, 'success');
            } else if (result === 'lose') {
                newPoints = Math.max(0, newPoints - 25);
                newLosses += 1;
                showToast(`Defeat! -25 Points.`, 'error');
            } else if (result === 'draw') {
                newDraws += 1;
            }

            await supabase.from('game_stats').update({ 
                points: newPoints, wins: newWins, losses: newLosses, draws: newDraws 
            }).eq('user_id', userId).eq('game_id', gameId);
        } catch (error) {
            console.error("Error updating stats:", error);
        }
    };

    // --- TELEPORT LOGIC ---
    const redirectToRoyalArena = (gameId: string, msgId: string) => {
        setActiveChallengeMsgId(msgId);
        showToast(`Entering the Royal Arena...`, 'success');
        const arenaUrl = `https://theroyalfoundation.org.in/game/?game=${gameId}&match=${roomName}&uid=${authUser.id}`;
        setTimeout(() => { setActiveArenaUrl(arenaUrl); }, 800);
    };

    // --- SOCKET & DB INIT ---
    useEffect(() => {
        if (!activeChat?.id || !authUser?.id) return

        const fetchHistory = async () => {
            const { data } = await supabase
                .from('messages')
                .select(`*, reply_to:messages!reply_to_id(content, sender_id, sender:profiles!messages_sender_id_fkey(display_name))`)
                .or(`and(sender_id.eq.${authUser.id},receiver_id.eq.${activeChat.id}),and(sender_id.eq.${activeChat.id},receiver_id.eq.${authUser.id})`)
                .order('created_at', { ascending: true })

            if (data) {
                setMessages(data)
                setTimeout(scrollToBottom, 100)
            }
        }
        fetchHistory()

        // --- PRODUCTION SOCKET CONFIG ---
        socketRef.current = io(SOCKET_URL, {
            path: "/chat-socket/", 
            transports: ['websocket'], 
            secure: true,
            reconnection: true,
            reconnectionAttempts: 10,
            timeout: 10000,
            rejectUnauthorized: false
        })
        
        const socket = socketRef.current
        socket.emit('join_room', roomName)

        socket.on('receive_message', (incomingMsg) => {
            setMessages(prev => [...prev, incomingMsg])
            setTimeout(scrollToBottom, 50)
        })

        socket.on('typing_status', (data) => {
            if (data.userId === activeChat.id) setIsTyping(data.isTyping)
        })

        socket.on('message_deleted', (deletedIds) => {
            setMessages(prev => prev.filter(msg => !deletedIds.includes(msg.id)))
        })

        socket.on('reaction_added', ({ msgId, emoji }) => {
            setMessages(prev => prev.map(msg => msg.id === msgId ? { ...msg, reaction: emoji } : msg))
        })

        socket.on('message_updated', (updatedData) => {
            setMessages(prev => prev.map(msg => msg.id === updatedData.id ? { ...msg, content: updatedData.content } : msg))
        })

        return () => { socket.disconnect() }
    }, [activeChat?.id, authUser?.id, roomName])

    const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
        setChatInput(e.target.value)
        if (socketRef.current) socketRef.current.emit('typing', { room: roomName, userId: authUser.id, isTyping: e.target.value.length > 0 })
    }

    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!chatInput.trim() || !activeChat || !authUser) return
        executeSendMessage(chatInput.trim(), replyingTo?.id)
        setChatInput('')
        setReplyingTo(null)
    }

    const executeSendMessage = async (contentStr: string, replyId: string | null = null, forceId: string | null = null) => {
        const validUUID = forceId || crypto.randomUUID()
        let replyData = null;
        if (replyingTo) {
            const isMyReply = replyingTo.sender_id === authUser.id;
            replyData = {
                content: replyingTo.content,
                sender_id: replyingTo.sender_id,
                sender: { display_name: isMyReply ? (authUser.display_name || "You") : activeChat.display_name }
            };
        }

        const newMsg = {
            id: validUUID, sender_id: authUser.id, receiver_id: activeChat.id, content: contentStr, created_at: new Date().toISOString(), reply_to_id: replyId, reply_to: replyData, reaction: null
        }

        setMessages(prev => [...prev, newMsg])
        socketRef.current?.emit('send_message', { room: roomName, message: newMsg })
        socketRef.current?.emit('typing', { room: roomName, userId: authUser.id, isTyping: false })
        setTimeout(scrollToBottom, 50)
        await supabase.from('messages').insert([{ id: newMsg.id, sender_id: authUser.id, receiver_id: activeChat.id, content: contentStr, reply_to_id: replyId }])
    }

    const sendChallenge = async (game: any) => {
        setShowGameMenu(false)
        const msgId = crypto.randomUUID();
        const challengePayload = JSON.stringify({
            isChallenge: true, gameId: game.id, gameName: game.name, expiresAt: Date.now() + 60000, status: 'pending'
        })
        await executeSendMessage(challengePayload, null, msgId);
        redirectToRoyalArena(game.id, msgId);
    }

    const updateChallengeStatus = async (msgId: string, parsedContent: any, newStatus: string, winnerId?: string) => {
        parsedContent.status = newStatus
        if (winnerId) parsedContent.winnerId = winnerId;
        const updatedContentStr = JSON.stringify(parsedContent)
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: updatedContentStr } : m))
        socketRef.current?.emit('update_message', { room: roomName, id: msgId, content: updatedContentStr })
        await supabase.from('messages').update({ content: updatedContentStr }).eq('id', msgId)
        if (newStatus === 'accepted') redirectToRoyalArena(parsedContent.gameId, msgId);
    }

    const toggleSelection = (msgId: string) => {
        const newSelection = new Set(selectedMessages);
        if (newSelection.has(msgId)) newSelection.delete(msgId);
        else newSelection.add(msgId);
        setSelectedMessages(newSelection);
    }

    const deleteSelectedMessages = async () => {
        const idsToDelete = Array.from(selectedMessages)
        setSelectedMessages(new Set())
        setMessages(prev => prev.filter(msg => !idsToDelete.includes(msg.id)))
        socketRef.current?.emit('delete_message', { room: roomName, deletedIds: idsToDelete })
        await supabase.from('messages').delete().in('id', idsToDelete)
    }

    const addReaction = async (msgId: string, emoji: string) => {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reaction: emoji } : m))
        socketRef.current?.emit('add_reaction', { room: roomName, msgId, emoji })
        await supabase.from('messages').update({ reaction: emoji }).eq('id', msgId)
    }

    return (
        <div suppressHydrationWarning className="absolute inset-0 bg-[#020617] flex flex-col z-10 animate-in fade-in duration-300">
            
            {/* ARENA OVERLAY */}
            {activeArenaUrl && (
                <div className="absolute inset-0 z-[100] bg-black animate-in fade-in zoom-in-95 duration-300">
                    <iframe src={activeArenaUrl} className="w-full h-full border-0" allow="autoplay; fullscreen" />
                </div>
            )}

            {/* HEADER */}
            <div className="p-6 border-b border-slate-800 bg-[#0f172a] flex items-center justify-between shadow-md">
                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition text-slate-400">
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div className="relative cursor-pointer" onClick={() => setShowProfile(true)}>
                        <img src={activeChat.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${activeChat.id}`} className="w-12 h-12 rounded-xl object-cover bg-slate-800" />
                        {isTyping && <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0f172a] animate-ping" />}
                    </div>
                    <div>
                        <h2 className="font-black text-lg text-white mb-1 leading-none">{activeChat.display_name}</h2>
                        {isTyping ? <p className="text-emerald-400 text-xs font-bold uppercase animate-pulse">Typing...</p> : <p className="text-indigo-400 text-xs font-mono">{activeChat.special_id}</p>}
                    </div>
                </div>
            </div>

            {/* CHAT AREA WITH HYDRATION GUARD */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 bg-[#020617] relative scroll-smooth">
                {hasMounted && messages.map((msg) => {
                    const isMe = msg.sender_id === authUser.id
                    let isChallenge = false
                    let challengeData = null
                    if (msg.content.startsWith('{"isChallenge":true')) {
                        try { challengeData = JSON.parse(msg.content); isChallenge = true; } catch (e) { }
                    }

                    return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group relative`}>
                            <div className="relative max-w-[85%] sm:max-w-[70%] z-10 flex items-center gap-3">
                                <div className="relative">
                                    {isChallenge && challengeData ? (
                                        <ChallengeCard 
                                            data={challengeData} 
                                            isMe={isMe} 
                                            myUserId={authUser.id} 
                                            onAccept={() => updateChallengeStatus(msg.id, challengeData, 'accepted')} 
                                            onExpire={() => updateChallengeStatus(msg.id, challengeData, 'expired')} 
                                        />
                                    ) : (
                                        <div className={`px-5 py-3 rounded-3xl ${isMe ? 'bg-indigo-600 text-white rounded-br-sm shadow-xl' : 'bg-[#0f172a] border border-slate-800 text-slate-200 rounded-bl-sm'}`}>
                                            <p className="leading-relaxed text-[15px] font-medium">{msg.content}</p>
                                            
                                            {/* STABLE TIME FIX */}
                                            <div className={`flex items-center mt-1 gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                <span suppressHydrationWarning className="text-[9px] opacity-40 font-bold uppercase">
                                                    {hasMounted ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* FOOTER */}
            <div className="p-4 sm:p-6 bg-[#0f172a] border-t border-slate-800">
                <form onSubmit={sendMessage} className="flex items-center gap-3">
                    <button type="button" onClick={() => setShowGameMenu(!showGameMenu)} className="p-4 bg-slate-900 border-2 border-slate-700 text-indigo-500 rounded-2xl transition">
                        <Gamepad2 className="w-6 h-6" />
                    </button>
                    <input type="text" value={chatInput} onChange={handleTyping} placeholder="Type your message..." className="w-full bg-slate-900 border border-slate-700 rounded-2xl py-4 px-6 text-white outline-none focus:ring-2 focus:ring-indigo-500 transition" />
                    <button type="submit" className="bg-indigo-600 text-white p-4 rounded-2xl hover:scale-105 transition active:scale-95">
                        <Send className="w-6 h-6" />
                    </button>
                </form>
            </div>

            {/* GAME MENU */}
            {showGameMenu && (
                <div className="absolute bottom-[100px] left-4 right-4 bg-[#1e293b] border border-slate-700 rounded-[2rem] p-6 z-50 shadow-2xl animate-in slide-in-from-bottom-5 duration-300">
                    <div className="grid grid-cols-3 gap-4">
                        {ARCADE_GAMES.map(game => {
                            const Icon = game.icon
                            return (
                                <button key={game.id} onClick={() => sendChallenge(game)} className="flex flex-col items-center p-4 bg-slate-900 rounded-2xl hover:bg-slate-800 transition transform hover:-translate-y-1">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2 ${game.color}`}>
                                        <Icon className="w-6 h-6 text-white" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-300 uppercase tracking-tighter">{game.name}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
            
            {showProfile && <UserProfile user={activeChat} onClose={() => setShowProfile(false)} />}
        </div>
    )
}

const ChallengeCard = ({ data, isMe, myUserId, onAccept }: any) => {
    // Hydration guard for the Card too
    const [hasMounted, setHasMounted] = useState(false);
    useEffect(() => { setHasMounted(true); }, []);
    
    const GameIcon = ARCADE_GAMES.find(g => g.id === data.gameId)?.icon || Gamepad2
    const colorClass = ARCADE_GAMES.find(g => g.id === data.gameId)?.color || 'bg-indigo-500'

    if (!hasMounted) return null;

    return (
        <div className={`w-[280px] p-1 rounded-3xl ${isMe ? 'bg-indigo-500 shadow-xl shadow-indigo-500/20' : 'bg-slate-800 border border-slate-700'}`}>
            <div className="bg-[#0f172a] rounded-[1.3rem] p-5 h-full relative overflow-hidden">
                <div className="flex items-center mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mr-3 ${colorClass}`}>
                        <GameIcon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Challenge</p>
                        <p className="font-black text-white text-base leading-tight">{data.gameName}</p>
                    </div>
                </div>
                {data.status === 'pending' && !isMe && (
                    <button onClick={onAccept} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-3 rounded-xl uppercase text-sm transition shadow-lg shadow-indigo-500/20">Accept Battle</button>
                )}
                {data.status === 'pending' && isMe && (
                    <div className="text-center text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                        Waiting for opponent...
                    </div>
                )}
                {data.status === 'accepted' && (
                    <div className="text-amber-400 font-black text-center text-sm uppercase animate-pulse flex items-center justify-center gap-2">
                         <Swords className="w-4 h-4" /> Battle in Progress!
                    </div>
                )}
                {data.status === 'completed' && (
                    <div className="text-center bg-slate-900/50 rounded-xl py-2 border border-slate-800">
                        <p className={`font-black text-lg uppercase ${data.winnerId === myUserId ? 'text-emerald-400' : 'text-red-400'}`}>
                            {data.winnerId === myUserId ? '🏆 Victory' : '💀 Defeat'}
                        </p>
                    </div>
                )}
                {data.status === 'draw' && <div className="text-slate-400 font-black text-center text-sm uppercase bg-slate-900/50 py-2 rounded-xl border border-slate-800">🤝 Draw</div>}
            </div>
        </div>
    )
}

const Swords = ({ className }: { className?: string }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="20" y2="20"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="17" x2="4" y2="20"/><line x1="3" y1="19" x2="4" y2="20"/></svg>
)
