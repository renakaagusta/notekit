import { type FC } from 'react'
import styles from './styles.module.css'
import LayoutWrapper from '@/components/layout-wrapper'
import SectionHeading from '@/components/sectionHeading'

const GitProviderIcons = () => (
	<div className={styles.provider__icons}>
		<span className={styles.provider__pill}>
			<ForgejoIcon />
			Forgejo
		</span>
		<span className={styles.provider__pill}>
			<GitHubIcon />
			GitHub
		</span>
		<span className={styles.provider__pill}>
			<GitLabIcon />
			GitLab
		</span>
	</div>
)

const AIProviderIcons = () => (
	<div className={styles.provider__icons}>
		<span className={styles.provider__pill}>
			<ClaudeIcon />
			Claude
		</span>
		<span className={styles.provider__pill}>
			<OpenAIIcon />
			GPT-4o
		</span>
		<span className={styles.provider__pill}>
			<GenericAIIcon />
			Any model
		</span>
	</div>
)

const LicenseBadges = () => (
	<div className={styles.provider__icons}>
		<span className={styles.provider__pill}>
			<MITIcon />
			MIT clients
		</span>
		<span className={styles.provider__pill}>
			<AGPLIcon />
			AGPL server
		</span>
	</div>
)

const NoLockIn: FC = () => {
	return (
		<section className={styles.no__lockin}>
			<LayoutWrapper>
				<div className={styles.heading__container}>
					<SectionHeading
						badgeText='No lock-in'
						heading='Your notes. Your rules.'
					/>
					<p className={styles.description}>
						NoteKit doesn&apos;t hold your data hostage. Your vault is a Git
						repo — take it anywhere, any time.
					</p>
				</div>

				<div className={styles.cards__grid}>
					<div className={styles.card}>
						<div className={styles.card__icon}>
							<GitStorageIcon />
						</div>
						<h3 className={styles.card__title}>BYO Git provider</h3>
						<p className={styles.card__description}>
							Store your vault on any Git host you trust. NoteKit manages a
							Forgejo instance for you by default, but you can point it at your
							own GitHub or GitLab repo with one setting change.
						</p>
						<GitProviderIcons />
					</div>

					<div className={styles.card}>
						<div className={styles.card__icon}>
							<AIIcon />
						</div>
						<h3 className={styles.card__title}>BYO AI provider</h3>
						<p className={styles.card__description}>
							MCP is model-agnostic. Connect Claude Code, GPT-4o, or any
							OpenAI-compatible endpoint. NoteKit never forces a specific AI
							vendor on you.
						</p>
						<AIProviderIcons />
					</div>

					<div className={styles.card}>
						<div className={styles.card__icon}>
							<OSIcon />
						</div>
						<h3 className={styles.card__title}>Fully open source</h3>
						<p className={styles.card__description}>
							Every client — web, desktop, mobile, CLI — is MIT licensed and
							publicly auditable. The sync server is AGPL. No closed blobs, no
							proprietary SDKs.
						</p>
						<LicenseBadges />
					</div>
				</div>
			</LayoutWrapper>
		</section>
	)
}

const GitStorageIcon = () => (
	<svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
		<circle cx='18' cy='18' r='3' />
		<circle cx='6' cy='6' r='3' />
		<path d='M13 6h3a2 2 0 0 1 2 2v7' />
		<path d='M11 6H6' />
		<path d='M6 9v3' />
	</svg>
)

const AIIcon = () => (
	<svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
		<circle cx='12' cy='12' r='3' />
		<path d='M12 3v2M12 19v2M3 12h2M19 12h2M5.636 5.636l1.414 1.414M16.95 16.95l1.414 1.414M5.636 18.364l1.414-1.414M16.95 7.05l1.414-1.414' />
	</svg>
)

const OSIcon = () => (
	<svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
		<path d='M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22' />
	</svg>
)

const ForgejoIcon = () => (
	<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
		<circle cx='12' cy='5' r='2' />
		<circle cx='5' cy='19' r='2' />
		<circle cx='19' cy='19' r='2' />
		<path d='M12 7v4M5 17V13a7 7 0 0 1 7-7M19 17V13a7 7 0 0 0-7-7' />
	</svg>
)

const GitHubIcon = () => (
	<svg width='14' height='14' viewBox='0 0 24 24' fill='currentColor'>
		<path d='M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z' />
	</svg>
)

const GitLabIcon = () => (
	<svg width='14' height='14' viewBox='0 0 24 24' fill='currentColor'>
		<path d='M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z' />
	</svg>
)

const ClaudeIcon = () => (
	<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round'>
		<circle cx='12' cy='12' r='9' />
		<path d='M8 12h8M12 8v8' />
	</svg>
)

const OpenAIIcon = () => (
	<svg width='14' height='14' viewBox='0 0 24 24' fill='currentColor'>
		<path d='M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0L4.5 14.185a4.504 4.504 0 0 1-2.16-6.29zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.317 2.614a4.504 4.504 0 0 1-.676 8.137v-5.678a.795.795 0 0 0-.394-.722zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.316-2.591a4.504 4.504 0 0 1 6.682 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.504 4.504 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.392.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z' />
	</svg>
)

const GenericAIIcon = () => (
	<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
		<path d='M12 2L2 7l10 5 10-5-10-5z' />
		<path d='M2 17l10 5 10-5' />
		<path d='M2 12l10 5 10-5' />
	</svg>
)

const MITIcon = () => (
	<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
		<path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
		<path d='M9 12l2 2 4-4' />
	</svg>
)

const AGPLIcon = () => (
	<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
		<circle cx='12' cy='12' r='10' />
		<path d='M12 8v4l3 3' />
	</svg>
)

export default NoLockIn
