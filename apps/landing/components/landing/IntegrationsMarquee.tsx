import { Marquee } from '@/components/ui/marquee'
import { Github, GitBranch, Monitor, Smartphone, Terminal, BookOpen } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const integrations: { name: string; icon: LucideIcon; color: string }[] = [
  { name: 'GitHub', icon: Github, color: '#fff' },
  { name: 'GitLab', icon: GitBranch, color: '#FC6D26' },
  { name: 'Forgejo', icon: GitBranch, color: '#78BF8E' },
  { name: 'Desktop', icon: Monitor, color: '#ea7317' },
  { name: 'iOS', icon: Smartphone, color: '#fff' },
  { name: 'Android', icon: Smartphone, color: '#3DDC84' },
  { name: 'CLI', icon: Terminal, color: '#ea7317' },
  { name: 'MCP', icon: BookOpen, color: '#A855F7' },
  { name: 'ProseMirror', icon: BookOpen, color: '#4FC3F7' },
]

function IntegrationCard({ name, icon: Icon, color }: { name: string; icon: LucideIcon; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-3 hover:border-white/[0.15] transition-colors mx-2">
      <Icon size={20} style={{ color }} />
      <span className="text-sm font-medium text-white/70">{name}</span>
    </div>
  )
}

export function IntegrationsMarquee() {
  return (
    <section className="py-20 overflow-hidden">
      <div className="text-center mb-10 px-6">
        <p className="text-[#ea7317] text-sm font-semibold uppercase tracking-widest mb-3">Works everywhere</p>
        <h2 className="text-2xl md:text-3xl font-bold text-white">Integrates with your whole stack</h2>
      </div>

      <div className="relative">
        <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-black to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none" />
        <Marquee pauseOnHover className="[--duration:30s]">
          {integrations.map((item) => (
            <IntegrationCard key={item.name} {...item} />
          ))}
        </Marquee>
        <Marquee pauseOnHover reverse className="[--duration:25s] mt-3">
          {[...integrations].reverse().map((item) => (
            <IntegrationCard key={`r-${item.name}`} {...item} />
          ))}
        </Marquee>
      </div>
    </section>
  )
}
