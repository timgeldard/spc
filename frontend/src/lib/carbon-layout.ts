import * as GridModule from '@carbon/react/es/components/Grid/Grid.js'

export { default as Column } from '@carbon/react/es/components/Grid/Column.js'
export { ContentSwitcher } from '@carbon/react/es/components/ContentSwitcher/ContentSwitcher.js'
export { Stack } from '@carbon/react/es/components/Stack/Stack.js'
export { ClickableTile, Tile } from '@carbon/react/es/components/Tile/Tile.js'
export { default as Tag } from '@carbon/react/es/components/Tag/Tag.js'

const gridRuntime = GridModule as any

export const Grid = gridRuntime.Grid ?? gridRuntime.GridAsGridComponent
