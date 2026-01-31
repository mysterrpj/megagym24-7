import { Button } from '@/components/ui/button';
import { ArrowRight, MessageSquare, Shield, Zap } from 'lucide-react';
import { PhoneMockup } from '@/components/landing/PhoneMockup';

export function LandingPage() {
    return (
        <div className="min-h-screen bg-black text-white selection:bg-green-500/30">
            {/* Header */}
            <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/50 backdrop-blur-lg">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                            <span className="font-bold text-white">IA</span>
                        </div>
                        <span className="text-xl font-bold">Fit IA</span>
                        <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-white/50 ml-2">v3.0</span>
                    </div>
                    <nav className="hidden md:flex gap-8 text-sm font-medium text-gray-300">
                        <a href="#features" className="hover:text-white transition-colors">Características</a>
                        <a href="#benefits" className="hover:text-white transition-colors">Beneficios</a>
                        <a href="#pricing" className="hover:text-white transition-colors">Precios</a>
                    </nav>
                    <Button variant="outline" className="border-white/20 hover:bg-white/10 text-white" onClick={() => window.location.href = '/login'}>
                        Panel de Control
                    </Button>
                </div>
            </header>

            {/* Hero Section */}
            <section className="pt-32 pb-20 px-4 relative overflow-hidden">
                <div className="absolute top-0 center w-full h-[500px] bg-green-500/20 blur-[120px] rounded-full pointer-events-none" />

                <div className="container mx-auto text-center relative z-10 max-w-4xl">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-sm font-medium mb-8 border border-green-500/20">
                        <Zap className="w-4 h-4" />
                        <span>Potenciado por Inteligencia Artificial</span>
                    </div>

                    <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight tracking-tight">
                        Tu Gimnasio en <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600">
                            WhatsApp 24/7
                        </span>
                    </h1>

                    <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
                        Gestiona membresías, reservas de clases y pagos en piloto automático.
                        Tu asistente de IA atiende a tus miembros mientras tú te enfocas en entrenar.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
                        <Button className="bg-green-600 hover:bg-green-700 text-white h-12 px-8 text-lg rounded-full" onClick={() => window.location.href = '/login'}>
                            Comenzar Gratis <ArrowRight className="ml-2 w-5 h-5" />
                        </Button>
                        <Button variant="outline" className="h-12 px-8 text-lg rounded-full border-white/20 text-white hover:bg-white/10">
                            Ver Demo
                        </Button>
                    </div>

                    <div className="relative z-10 mt-10">
                        <PhoneMockup />
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section className="py-20 bg-neutral-900/50">
                <div className="container mx-auto px-4">
                    <div className="grid md:grid-cols-3 gap-8">
                        {[
                            {
                                icon: MessageSquare,
                                title: "Atención 24/7",
                                description: "Tu IA responde consultas, agenda clases y resuelve dudas por WhatsApp al instante."
                            },
                            {
                                icon: Shield,
                                title: "Pagos Seguros",
                                description: "Gestiona suscripciones y cobros recurrentes de forma automática y segura."
                            },
                            {
                                icon: Zap,
                                title: "Gestión Total",
                                description: "Dashboard completo para administrar miembros, clases y finanzas en un solo lugar."
                            }
                        ].map((feature, i) => (
                            <div key={i} className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-green-500/50 transition-colors">
                                <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center text-green-500 mb-4">
                                    <feature.icon className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                                <p className="text-gray-400">{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    )
}
