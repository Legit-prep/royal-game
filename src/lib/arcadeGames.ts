import { 
  Target, Grid, Crown, Dices, Trophy, Zap, Candy, Scissors, Bomb 
} from 'lucide-react'

// You can easily add new games here later!
export const ARCADE_GAMES = [
  { id: 'ninja', name: 'Fruit Slash', icon: Scissors, color: 'bg-emerald-500' },
  { id: 'candy', name: 'Candy Match', icon: Candy, color: 'bg-pink-500' },
  { id: 'javelin', name: 'Javelin Warrior', icon: Target, color: 'bg-red-500' },
  { id: 'minesweeper', name: 'Minesweeper', icon: Bomb, color: 'bg-slate-500' },
  { id: 'ludo', name: 'Ludo Hero', icon: Dices, color: 'bg-green-500' },
  { id: 'chess', name: 'Master Chess', icon: Crown, color: 'bg-amber-500' },
  { id: 'basketball', name: 'Hoops Battle', icon: Trophy, color: 'bg-orange-500' }, // Swapped Dribbble for Trophy!
  { id: 'cricket', name: 'Cricket Clash', icon: Zap, color: 'bg-yellow-500' },
  { id: 'tictactoe', name: 'Circle & Tick', icon: Grid, color: 'bg-blue-500' },
]