import { type FC } from 'react'
import AmbientLighting from '@/components/ambient-lighting'
import Header from '@/components/header'
import Hero from '@/app/sections/hero'
import TechStack from '@/app/sections/customers'
import Devices from '@/app/sections/modern-product-teams'
import NoteManagement from '@/app/sections/issue-tracking'
import GitHistory from '@/app/sections/long-term-planning'
import AgentAccess from '@/app/sections/collaborate'
import NoLockIn from '@/app/sections/no-lockin'
import Privacy from '@/app/sections/foundation'
import PreFooter from '@/app/sections/prefooter'
import Footer from '@/components/footer'

const Home: FC = () => (
	<>
		<Header />
		<main className='min-h-screen pt-[calc(var(--header-top)+var(--header-height))]'>
			<AmbientLighting />
			<Hero />
			<TechStack />
			<Devices />
			<NoteManagement />
			<GitHistory />
			<AgentAccess />
			<NoLockIn />
			<Privacy />
			<PreFooter />
		</main>
		<Footer />
	</>
)

export default Home
