import noEmojiAsIcon from './rules/no-emoji-as-icon.js'
import bindFetchGlobalThis from './rules/bind-fetch-globalthis.js'
import noReinventCore from './rules/no-reinvent-core.js'

export default {
  rules: {
    'no-emoji-as-icon': noEmojiAsIcon,
    'bind-fetch-globalthis': bindFetchGlobalThis,
    'no-reinvent-core': noReinventCore,
  },
}
