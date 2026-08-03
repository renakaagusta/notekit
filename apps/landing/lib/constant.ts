export type FooterSection = {
	title: string
	items: { id: string | number; link: string; item: string }[]
}

export const footerSections: FooterSection[] = [
	{
		title: 'Product',
		items: [
			{ id: 'f-11', link: 'https://app.notekit.online', item: 'Web App' },
			{ id: 'f-12', link: '#', item: 'Desktop' },
			{ id: 'f-13', link: '#', item: 'Mobile' },
			{ id: 'f-14', link: '#', item: 'CLI' },
			{ id: 'f-15', link: '#', item: 'Pricing' },
			{ id: 'f-16', link: '#', item: 'Changelog' },
		],
	},
	{
		title: 'Company',
		items: [
			{ id: 'f-21', link: '#', item: 'About' },
			{ id: 'f-22', link: '#', item: 'Blog' },
			{
				id: 'f-23',
				link: 'https://github.com/notekit-io/notekit',
				item: 'Open Source',
			},
		],
	},
	{
		title: 'Resources',
		items: [
			{ id: 'f-31', link: '#', item: 'Docs' },
			{ id: 'f-32', link: '#', item: 'Privacy Policy' },
			{ id: 'f-33', link: '#', item: 'Terms of Service' },
		],
	},
	{
		title: 'Developers',
		items: [
			{
				id: 'f-41',
				link: 'https://github.com/notekit-io/notekit',
				item: 'GitHub',
			},
			{ id: 'f-42', link: '#', item: 'MCP Docs' },
			{ id: 'f-43', link: '#', item: 'API' },
		],
	},
]

export type FoundationListItem = {
	id: string | number
	label: string
	value: string
}

export type FoundationList = FoundationListItem[]

export const foundationList: FoundationList = [
	{
		id: 'foundation-1',
		label: 'age encryption',
		value:
			'X25519 key exchange. Every note encrypted before it leaves your device.',
	},
	{
		id: 'foundation-2',
		label: 'Git-backed storage',
		value:
			'Every save is a commit. Full history, attribution, and rollback built in.',
	},
	{
		id: 'foundation-3',
		label: 'BIP39 recovery',
		value: '24-word mnemonic phrase. Lose your device, keep your vault.',
	},
]

export const modernProductCards = [
	{
		id: 'card-1',
		title: 'Web — notes in your browser, fully E2EE',
	},
	{
		id: 'card-2',
		title: 'Desktop — offline Electron app with native feel',
	},
	{
		id: 'card-3',
		title: 'Mobile — iOS & Android, Obsidian-style drawer',
	},
	{
		id: 'card-4',
		title: 'CLI — headless access for agents & scripts',
	},
]
