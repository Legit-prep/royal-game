'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { io, Socket } from 'socket.io-client'
import { ARCADE_GAMES } from '../lib/arcadeGames'
import { ChevronLeft, Trash2, Send, CheckSquare, CornerDownRight, Smile, X, Swords, Timer, Gamepad2 } from 'lucide-react'
import UserProfile from './UserProfile'

const SOCKET_URL = 'http://engine.theroyalfoundation.org.in:3001'

export default function ChatWindow({ activeChat, authUser, onClose, showToast }: any) {
    const [messages, setMessages] = useState<any[]>([])
    const [chatInput, setChatInput] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set())
    const [replyingTo, setReplyingTo] = useState<any | null>(null)
    const [showGameMenu, setShowGameMenu] = useState(false)
    const [showProfile, setShowProfile] = useState(false)
    
    // NEW: Iframe Overlay State
    const [activeArenaUrl, setActiveArenaUrl] = useState<string | null>(null)
    const [activeChallengeMsgId, setActiveChallengeMsgId] = useState<string | null>(null)
    
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const socketRef = useRef<Socket | null>(null)

    const roomName = `chat_${[authUser?.id, activeChat?.id].sort().join('_')}`

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    // --- GAME ENGINE LISTENER (SUPABASE POINTS) ---
    useEffect(() => {
        if (!authUser) return;

        const handleGameMessage = async (event: MessageEvent) => {
            const data = event.data;

            // 1. Handling the "Return to Hub" / Cancel button
            if (data?.type === 'RETURN_TO_HUB') {
                setActiveArenaUrl(null);
            }

            // 2. Handling the End of a Match
            if (data?.type === 'GAME_OVER') {
                console.log(`[SYSTEM] Match Finished: ${data.result} in ${data.game}`);
                await processGameResult(authUser.id, data.game, data.result);

                // Update the chat bubble to show Victory/Defeat
                if (activeChallengeMsgId) {
                    const msg = messages.find(m => m.id === activeChallengeMsgId);
                    if (msg) {
                        try {
                            const parsed = JSON.parse(msg.content);
                            if (data.result === 'win') {
                                // The winner updates the DB to prevent duplicate calls
                                updateChallengeStatus(activeChallengeMsgId, parsed, 'completed', authUser.id);
                            } else if (data.result === 'draw' && msg.sender_id === authUser.id) {
                                // Only the challenger updates on draw
                                updateChallengeStatus(activeChallengeMsgId, parsed, 'draw');
                            }
                        } catch (e) {}
                    }
                }
                
                // Close the Arena overlay
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
                showToast(`Victory! +25 Points added to your global rank.`, 'success');
            } else if (result === 'lose') {
                newPoints = Math.max(0, newPoints - 25);
                newLosses += 1;
                showToast(`Defeat! -25 Points. Better luck next time.`, 'error');
            } else if (result === 'draw') {
                newDraws += 1;
            }

            await supabase.from('game_stats').update({ points: newPoints, wins: newWins, losses: newLosses, draws: newDraws }).eq('user_id', userId).eq('game_id', gameId);
        } catch (error) {
            console.error("Error updating game stats:", error);
        }
    };

    // --- TELEPORT LOGIC ---
    const redirectToRoyalArena = (gameId: string, msgId: string) => {
        setActiveChallengeMsgId(msgId);
        showToast(`Entering the Royal Arena...`, 'success');
        
        // SECURITY UPDATE: Passing authUser.id into the URL to block ghosts!
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

        socketRef.current = io(SOCKET_URL)
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

    // --- CHALLENGE LOGIC ---
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

    let swipeStartX = 0;
    const handleTouchStart = (e: React.TouchEvent) => swipeStartX = e.touches[0].clientX;
    const handleTouchEnd = (e: React.TouchEvent, msg: any) => {
        const swipeEndX = e.changedTouches[0].clientX;
        if (swipeEndX - swipeStartX > 50) setReplyingTo(msg);
    };

    return (
        <div className="absolute inset-0 bg-[#020617] flex flex-col z-10 animate-in fade-in duration-300">
            
            {/* FULL SCREEN ARENA OVERLAY */}
            {activeArenaUrl && (
                <div className="absolute inset-0 z-[100] bg-black animate-in fade-in zoom-in-95 duration-300">
                    <iframe src={activeArenaUrl} className="w-full h-full border-0" allow="autoplay; fullscreen" />
                </div>
            )}

            {/* HEADER */}
            {selectedMessages.size > 0 ? (
                <div className="p-6 border-b border-slate-800 bg-indigo-600 flex items-center justify-between shadow-md">
                    <div className="flex items-center text-white font-bold">
                        <button onClick={() => setSelectedMessages(new Set())} className="mr-4 p-2 rounded-full hover:bg-white/10"><X /></button>
                        {selectedMessages.size} Selected
                    </div>
                    <button onClick={deleteSelectedMessages} className="p-3 bg-red-500 rounded-xl hover:bg-red-400 transition shadow-lg flex items-center">
                        <Trash2 className="w-5 h-5 mr-2" /> Delete
                    </button>
                </div>
            ) : (
                <div className="p-6 border-b border-slate-800 bg-[#0f172a] flex items-center justify-between shadow-md">
                    <div className="flex items-center gap-4">
                        <button onClick={onClose} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition text-slate-400">
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                        <div className="relative cursor-pointer hover:opacity-80 transition" onClick={() => setShowProfile(true)}>
                            <img src={activeChat.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${activeChat.id}`} className="w-12 h-12 rounded-xl object-cover bg-slate-800" />
                            {isTyping && <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0f172a] animate-ping" />}
                        </div>
                        <div className="cursor-pointer" onClick={() => setShowProfile(true)}>
                            <h2 className="font-black text-lg text-white leading-none mb-1 hover:text-indigo-400 transition">{activeChat.display_name}</h2>
                            {isTyping ? <p className="text-emerald-400 text-xs font-bold animate-pulse uppercase tracking-widest">Typing...</p> : <p className="text-indigo-400 text-xs font-mono hover:text-indigo-300 transition">{activeChat.special_id}</p>}
                        </div>
                    </div>
                </div>
            )}

            {/* CHAT AREA */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 scroll-smooth bg-[#020617] relative overflow-x-hidden">
                {messages.map((msg) => {
                    const isMe = msg.sender_id === authUser.id
                    const isSelected = selectedMessages.has(msg.id)
                    let isChallenge = false
                    let challengeData = null
                    if (msg.content.startsWith('{"isChallenge":true')) {
                        try { challengeData = JSON.parse(msg.content); isChallenge = true; } catch (e) { }
                    }

                    return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group relative`}
                            onClick={() => selectedMessages.size > 0 && toggleSelection(msg.id)}
                            onTouchStart={handleTouchStart}
                            onTouchEnd={(e) => handleTouchEnd(e, msg)}>

                            <div className={`relative max-w-[85%] sm:max-w-[70%] z-10 flex items-center gap-3 transition-transform duration-200 active:translate-x-4`}>
                                {selectedMessages.size > 0 && (
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600'}`}>
                                        {isSelected && <CheckSquare className="w-3 h-3 text-white" />}
                                    </div>
                                )}
                                <div className={`relative transition-all duration-200 ${isSelected ? 'scale-95 brightness-75' : ''}`}>
                                    {isChallenge && challengeData ? (
                                        <ChallengeCard data={challengeData} isMe={isMe} msgId={msg.id} myUserId={authUser.id} onAccept={() => updateChallengeStatus(msg.id, challengeData, 'accepted')} onExpire={() => updateChallengeStatus(msg.id, challengeData, 'expired')} />
                                    ) : (
                                        <div className={`px-5 py-3 rounded-3xl ${isMe ? 'bg-indigo-600 text-white rounded-br-sm shadow-xl shadow-indigo-500/10' : 'bg-[#0f172a] border border-slate-800 text-slate-200 rounded-bl-sm'}`}>
                                            {msg.reply_to && (
                                                <div className="mb-2 p-2.5 bg-black/30 rounded-xl text-xs border-l-4 border-indigo-400 backdrop-blur-sm shadow-inner cursor-pointer hover:bg-black/40 transition">
                                                    <p className="font-black text-indigo-300 mb-0.5">
                                                        {msg.reply_to.sender?.display_name || (msg.reply_to.sender_id === authUser.id ? (authUser.display_name || "You") : activeChat.display_name)}
                                                    </p>
                                                    <p className="opacity-80 truncate text-[11px]">{msg.reply_to.content}</p>
                                                </div>
                                            )}
                                            <p className="leading-relaxed text-[15px] font-medium">{msg.content}</p>
                                            <div className={`flex items-center mt-1 gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                <span className="text-[9px] opacity-40 font-bold uppercase">
                                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                    {msg.reaction && (
                                        <div className={`absolute -bottom-3 ${isMe ? 'right-4' : 'left-4'} bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5 text-xs shadow-xl animate-bounce z-20`}>
                                            {msg.reaction}
                                        </div>
                                    )}
                                    {selectedMessages.size === 0 && !isChallenge && (
                                        <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 ${isMe ? '-left-28' : '-right-28'}`}>
                                            <button onClick={(e) => { e.stopPropagation(); setReplyingTo(msg) }} className="p-2 bg-slate-800 text-slate-400 hover:text-white rounded-full"><CornerDownRight className="w-4 h-4" /></button>
                                            <button onClick={(e) => { e.stopPropagation(); addReaction(msg.id, '🔥') }} className="p-2 bg-slate-800 text-slate-400 hover:text-orange-500 rounded-full"><Smile className="w-4 h-4" /></button>
                                            <button onClick={(e) => { e.stopPropagation(); toggleSelection(msg.id) }} className="p-2 bg-slate-800 text-slate-400 hover:text-indigo-400 rounded-full"><CheckSquare className="w-4 h-4" /></button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* FOOTER INPUT */}
            <div className="bg-[#0f172a] border-t border-slate-800 z-20 relative">
                {replyingTo && (
                    <div className="bg-[#1e293b] px-4 py-3 flex items-center justify-between border-b border-slate-700/50">
                        <div className="border-l-4 border-indigo-500 pl-3">
                            <p className="text-xs font-black text-indigo-400 mb-0.5">Replying to {replyingTo.sender_id === authUser.id ? "yourself" : activeChat.display_name}</p>
                            <p className="text-xs text-slate-300 truncate max-w-[200px]">{replyingTo.content}</p>
                        </div>
                        <button onClick={() => setReplyingTo(null)} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-full transition">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}
                
                <div className="p-4 sm:p-6">
                    <form onSubmit={sendMessage} className="relative flex items-center gap-3">
                        <button type="button" onClick={() => setShowGameMenu(!showGameMenu)} className={`p-4 rounded-2xl transition border-2 ${showGameMenu ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-indigo-500'}`}>
                            <Gamepad2 className="w-6 h-6" />
                        </button>
                        <input type="text" value={chatInput} onChange={handleTyping} placeholder="Type your message..." className="w-full bg-slate-900 border border-slate-700 rounded-2xl py-4 px-6 text-white" />
                        <button type="submit" className="bg-indigo-600 text-white p-4 rounded-2xl transition hover:scale-105 active:scale-95">
                            <Send className="w-6 h-6" />
                        </button>
                    </form>
                </div>
            </div>

            {/* GAME MENU */}
            {showGameMenu && (
                <div className="absolute bottom-[90px] left-4 right-4 bg-[#1e293b] border border-slate-700 rounded-[2rem] p-6 z-50 shadow-2xl">
                    <div className="grid grid-cols-3 gap-4">
                        {ARCADE_GAMES.map(game => {
                            const Icon = game.icon
                            return (
                                <button key={game.id} onClick={() => sendChallenge(game)} className="flex flex-col items-center p-4 bg-slate-900 rounded-2xl hover:bg-slate-800 transition">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${game.color}`}>
                                        <Icon className="w-6 h-6 text-white" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-300">{game.name}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* PROFILE MODAL */}
            {showProfile && (
                <UserProfile user={activeChat} isFriend={true} onClose={() => setShowProfile(false)} />
            )}
        </div>
    )
}

// --- CHALLENGE CARD COMPONENT ---
const ChallengeCard = ({ data, isMe, msgId, myUserId, onAccept, onExpire }: any) => {
    const [timeLeft, setTimeLeft] = useState(0)
    useEffect(() => {
        if (data.status !== 'pending') return
        const calculateTime = () => {
            const remaining = Math.max(0, Math.floor((data.expiresAt - Date.now()) / 1000))
            setTimeLeft(remaining)
            if (remaining === 0) onExpire()
        }
        calculateTime()
        const timer = setInterval(calculateTime, 1000)
        return () => clearInterval(timer)
    }, [data.status, data.expiresAt, onExpire])

    const GameIcon = ARCADE_GAMES.find(g => g.id === data.gameId)?.icon || Gamepad2
    const colorClass = ARCADE_GAMES.find(g => g.id === data.gameId)?.color || 'bg-indigo-500'

    return (
        <div className={`w-[280px] p-1 rounded-3xl ${isMe ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : 'bg-[#1e293b] border border-slate-700'} shadow-2xl`}>
            <div className="bg-[#0f172a] rounded-[1.3rem] p-5 h-full relative overflow-hidden">
                <div className="flex items-center mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mr-3 ${colorClass}`}>
                        <GameIcon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Arcade Challenge</p>
                        <p className="font-black text-white text-base">{data.gameName}</p>
                    </div>
                </div>
                
                {data.status === 'pending' && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between bg-slate-900 rounded-xl p-3 border border-slate-800">
                            <span className="text-xs font-bold text-slate-400">Time to accept:</span>
                            <span className={`text-sm font-black flex items-center ${timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`}>
                                <Timer className="w-4 h-4 mr-1" /> 00:{timeLeft.toString().padStart(2, '0')}
                            </span>
                        </div>
                        {!isMe ? (
                            <button onClick={onAccept} className="w-full bg-indigo-600 text-white font-black py-3 rounded-xl uppercase text-sm hover:bg-indigo-500 transition">Accept Battle</button>
                        ) : (
                            <div className="text-center text-xs font-bold text-slate-500 py-2">Waiting for opponent...</div>
                        )}
                    </div>
                )}
                
                {data.status === 'accepted' && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
                        <p className="text-amber-400 font-black text-sm uppercase animate-pulse">Battle in Progress!</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-1 text-center">Do not close this window...</p>
                    </div>
                )}
                
                {/* THE WIN/LOSS DISPLAY */}
                {data.status === 'completed' && (
                    <div className={`border rounded-xl p-3 text-center ${data.winnerId === myUserId ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                        <p className={`font-black text-lg uppercase ${data.winnerId === myUserId ? 'text-emerald-400' : 'text-red-400'}`}>
                            {data.winnerId === myUserId ? '🏆 Victory' : '💀 Defeat'}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 mt-1 text-center">Match Concluded</p>
                    </div>
                )}
                
                {data.status === 'draw' && (
                    <div className="bg-slate-500/10 border border-slate-500/20 rounded-xl p-3 text-center">
                        <p className="text-slate-400 font-black text-sm uppercase">🤝 Draw</p>
                    </div>
                )}
                
                {data.status === 'expired' && (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center opacity-70">
                        <p className="text-slate-500 font-black text-sm uppercase">Expired</p>
                    </div>
                )}
            </div>
        </div>
    )
}
