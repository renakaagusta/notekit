export interface KeywordCampaign {
  id: string
  name: string
  domain: string
  location: string
  device: 'desktop' | 'mobile'
  competitors: { domain: string }[]
  lastRefreshedAt?: string | null
  refreshing?: boolean
  createdAt: string
  updatedAt: string
}

export interface TrackedKeyword {
  id: string
  keyword: string
  active: boolean
  searchVolume?: number | null
  keywordDifficulty?: number | null
  intent?: 'commercial' | 'informational' | 'navigational' | 'transactional' | null
  serpFeaturesCount?: number | null
  tags?: { tag: string }[]
  createdAt: string
}

export interface KeywordRanking {
  id: string
  keyword: { id: string; keyword: string } | string
  domain: string
  position?: number | null
  url?: string | null
  source: 'gsc' | 'dataseo'
  recordedAt: string
  estimatedTraffic?: number | null
  serpFeatures?: { feature: string }[]
}

export interface RankingDistribution {
  top3: number
  top10: number
  top20: number
  top100: number
  notRanking: number
}

export interface DomainSummary {
  domain: string
  visibility: number
  distribution: RankingDistribution
}

export interface PositionTrackingSummary {
  domains: DomainSummary[]
  totalKeywords: number
  lastUpdated: string | null
}

/** Per-keyword latest ranking across all domains, used for the rankings table */
export interface KeywordRow {
  keywordId: string
  keyword: string
  searchVolume?: number | null
  keywordDifficulty?: number | null
  intent?: string | null
  rankings: Record<string, { position: number | null; url: string | null; change?: number | null }>
}
