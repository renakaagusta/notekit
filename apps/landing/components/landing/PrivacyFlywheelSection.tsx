'use client'

import { NoteBeamAnimation } from '@/components/ui/animations/NoteBeamAnimation'

const steps = [
  {
    number: '01',
    title: 'Device key generated',
    description:
      'On first launch, your device generates a unique age keypair stored only in IndexedDB — never uploaded.',
  },
  {
    number: '02',
    title: 'Note encrypted locally',
    description:
      'Before any sync, each note is encrypted with age using your device public key as recipient.',
  },
  {
    number: '03',
    title: 'Encrypted blob pushed to Git',
    description:
      'Only the ciphertext reaches Git storage. The server, the VPS, and us — we store noise.',
  },
  {
    number: '04',
    title: 'Decrypted on your device',
    description:
      'When you pull on another device, it decrypts with the private key. Add devices by approving a key-exchange from a trusted device.',
  },
]

export function PrivacyFlywheelSection() {
  return (
    <section className="py-24 px-6 md:px-12 max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div>
          <p className="text-[#ea7317] text-sm font-semibold uppercase tracking-widest mb-4">Architecture</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-10">
            E2EE from day one,<br />not bolted on.
          </h2>
          <div className="space-y-8">
            {steps.map((step) => (
              <div key={step.number} className="flex gap-5">
                <div className="text-[#ea7317]/40 font-mono text-sm font-bold mt-1 w-8 shrink-0">
                  {step.number}
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-1">{step.title}</h4>
                  <p className="text-white/50 text-sm leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8">
          <NoteBeamAnimation />
        </div>
      </div>
    </section>
  )
}
