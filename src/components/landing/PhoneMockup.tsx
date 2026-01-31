import { motion } from 'framer-motion';

export function PhoneMockup() {
    return (
        <div className="relative mx-auto border-gray-800 dark:border-gray-800 bg-gray-900 border-[14px] rounded-[2.5rem] h-[600px] w-[300px] shadow-xl">
            <div className="w-[148px] h-[18px] bg-gray-800 top-0 rounded-b-[1rem] left-1/2 -translate-x-1/2 absolute"></div>
            <div className="h-[32px] w-[3px] bg-gray-800 absolute -start-[17px] top-[72px] rounded-s-lg"></div>
            <div className="h-[46px] w-[3px] bg-gray-800 absolute -start-[17px] top-[124px] rounded-s-lg"></div>
            <div className="h-[46px] w-[3px] bg-gray-800 absolute -start-[17px] top-[178px] rounded-s-lg"></div>
            <div className="h-[64px] w-[3px] bg-gray-800 absolute -end-[17px] top-[142px] rounded-e-lg"></div>

            {/* Screen Content */}
            <div className="rounded-[2rem] overflow-hidden w-full h-full bg-[#0b141a] relative flex flex-col font-sans">

                {/* WhatsApp Header */}
                <div className="bg-[#202c33] p-3 flex items-center gap-3 shadow-md z-10">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-xs">
                        IA
                    </div>
                    <div className="flex-1">
                        <h3 className="text-gray-100 text-sm font-semibold">Fit IA</h3>
                        <p className="text-[#25d366] text-[10px]">En línea</p>
                    </div>
                </div>

                {/* Chat Area */}
                <div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden relative">
                    {/* Background Pattern Hint */}
                    <div className="absolute inset-0 opacity-[0.05] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat"></div>

                    {/* Bot Message 1 */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 }}
                        className="bg-[#202c33] p-3 rounded-lg rounded-tl-none max-w-[85%] relative z-10 self-start shadow-sm"
                    >
                        <p className="text-sm text-gray-100 leading-snug">
                            ¡Hola! 👋 Soy Sofía, tu asistente de MegaGym. ¿En qué te ayudo?
                        </p>
                        <span className="text-[10px] text-gray-400 block text-right mt-1">10:30</span>
                    </motion.div>

                    {/* User Message */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1.5 }}
                        className="bg-[#005c4b] p-3 rounded-lg rounded-tr-none max-w-[85%] relative z-10 self-end shadow-sm"
                    >
                        <p className="text-sm text-gray-100 leading-snug">
                            Quiero congelar mi membresía por viaje ✈️
                        </p>
                        <span className="text-[10px] text-green-100/70 block text-right mt-1">10:31</span>
                    </motion.div>

                    {/* Bot Message 2 */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 2.5 }}
                        className="bg-[#202c33] p-3 rounded-lg rounded-tl-none max-w-[85%] relative z-10 self-start shadow-sm"
                    >
                        <p className="text-sm text-gray-100 leading-snug">
                            ¡Entendido! 🌍 Puedes congelarla por salud o viaje. ¿Qué fechas estarás fuera?
                        </p>
                        <span className="text-[10px] text-gray-400 block text-right mt-1">10:31</span>
                    </motion.div>
                </div>

                {/* Input Area Mockup */}
                <div className="bg-[#202c33] p-2 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gray-600/30"></div>
                    <div className="flex-1 h-8 bg-gray-700/30 rounded-full"></div>
                    <div className="w-8 h-8 rounded-full bg-[#00a884] flex items-center justify-center">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M1.101 21.757 23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z"></path></svg>
                    </div>
                </div>

            </div>
        </div>
    );
}
