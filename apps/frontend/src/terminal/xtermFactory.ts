import {
  ClipboardAddon,
  type ClipboardSelectionType,
  type IClipboardProvider,
} from '@xterm/addon-clipboard'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { SerializeAddon } from '@xterm/addon-serialize'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { type ITerminalOptions, type ITheme, Terminal } from '@xterm/xterm'

const systemClipboardSelection = 'c' as ClipboardSelectionType

export interface XtermFactoryOptions {
  fontFamily: string
  fontSize: number
  scrollback: number
  theme?: ITheme
}

export interface XtermBundle {
  terminal: Terminal
  addons: {
    fit: FitAddon
    search: SearchAddon
    webLinks: WebLinksAddon
    serialize: SerializeAddon
    clipboard: ClipboardAddon
    webgl: WebglAddon
  }
  clipboard: ControlledClipboardProvider
}

export class ControlledClipboardProvider implements IClipboardProvider {
  private text = ''

  constructor(public readonly osc52Enabled: boolean) {}

  async readText(selection: ClipboardSelectionType): Promise<string> {
    if (selection !== systemClipboardSelection) {
      return ''
    }

    return this.text
  }

  async writeText(selection: ClipboardSelectionType, text: string): Promise<void> {
    if (!this.osc52Enabled || selection !== systemClipboardSelection) {
      return
    }

    this.text = text
  }
}

// createXterm builds the base xterm.js terminal instance and attaches the MVP addons.
export function createXterm(options: XtermFactoryOptions): XtermBundle {
  const terminal = new Terminal(createTerminalOptions(options))
  const fit = new FitAddon()
  const search = new SearchAddon()
  const webLinks = new WebLinksAddon()
  const serialize = new SerializeAddon()
  const clipboardProvider = new ControlledClipboardProvider(false)
  const clipboard = new ClipboardAddon(undefined, clipboardProvider)
  const webgl = new WebglAddon()

  terminal.loadAddon(fit)
  terminal.loadAddon(search)
  terminal.loadAddon(webLinks)
  terminal.loadAddon(serialize)
  terminal.loadAddon(clipboard)
  terminal.loadAddon(webgl)

  return {
    terminal,
    addons: { fit, search, webLinks, serialize, clipboard, webgl },
    clipboard: clipboardProvider,
  }
}

function createTerminalOptions(options: XtermFactoryOptions): ITerminalOptions {
  return {
    allowProposedApi: false,
    convertEol: true,
    cursorBlink: true,
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    scrollback: options.scrollback,
    theme: options.theme,
  }
}
