import type { FC } from 'react'
import AgentAccess from '@/app/sections/collaborate'
import Hero from '@/app/sections/hero'
import NoteManagement from '@/app/sections/issue-tracking'
import GitHistory from '@/app/sections/long-term-planning'
import Devices from '@/app/sections/modern-product-teams'
import NoLockIn from '@/app/sections/no-lockin'
import PreFooter from '@/app/sections/prefooter'
import Pricing from '@/app/sections/pricing'
import AmbientLighting from '@/components/ambient-lighting'
import Footer from '@/components/footer'
import Header from '@/components/header'

const Home: FC = () => (
	<>
		<Header />
		<main className='min-h-screen pt-[calc(var(--header-top)+var(--header-height))]'>
			<AmbientLighting />
			<Hero />
			<Devices />
			<NoteManagement />
			<GitHistory />
			<AgentAccess />
			<NoLockIn />
			<Pricing />
			<PreFooter />
		</main>
		<Footer />
	</>
)

export default Home
