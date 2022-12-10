import { Marp } from '@marp-team/marp-core'
import { ExtensionContext, Uri, commands, workspace } from 'vscode'
import * as exportCommand from './commands/export'
import * as newMarpMarkdown from './commands/new-marp-markdown'
import * as openExtensionSettings from './commands/open-extension-settings'
import * as showQuickPick from './commands/show-quick-pick'
import * as toggleMarpFeature from './commands/toggle-marp-feature'
import diagnostics from './diagnostics/'
import languageProvider from './language/'
import { marpCoreOptionForPreview, clearMarpCoreOptionCache } from './option'
import customTheme from './plugins/custom-theme'
import lineNumber from './plugins/line-number'
import outline, { rule as outlineRule } from './plugins/outline'
import themes, { Themes } from './themes'
import { detectMarpFromMarkdown, marpConfiguration } from './utils'

const mdc = require('markdown-it-container');

const shouldRefreshConfs = [
  'markdown.marp.breaks',
  'markdown.marp.enableHtml',
  'markdown.marp.mathTypesetting',
  'markdown.marp.outlineExtension',
  'markdown.marp.themes',
  'markdown.preview.breaks',
  'markdown.preview.typographer',
]

const applyRefreshedConfiguration = () => {
  clearMarpCoreOptionCache()
  commands.executeCommand('markdown.preview.refresh')
}

export const marpVscode = Symbol('marp-vscode')

// const htmlEscapes = {
//   '&': '&amp;',
//   '<': '&lt;',
//   '>': '&gt;',
//   '"': '&quot;',
//   "'": '&#39;'
// }

// function escapeHtml(html: any) {
//   return html.replace(/[&<>"']/g, chr => htmlEscapes[chr])
// }

function getRenderFunction(type: any, arg_reg: any) {
  if (type === "details") {
    return (tokens: any[], idx: any) => {
      if (tokens[idx].nesting === 1) {
        // opening tag
        let title = tokens[idx].info.trim().match(arg_reg)[1];
        // title = escapeHtml(title);
        return `<details class="block details">${title ? `\n<summary>${title}</summary>\n` : ''}`;
      } else {
        // closing tag
        return '</details>\n';
      }
    };
  } else {
    return (tokens: any[], idx: any) => {
      if (tokens[idx].nesting === 1) {
        // opening tag
        let title = tokens[idx].info.trim().match(arg_reg)[1];
        // title = escapeHtml(title);
        return `<div class="block ${type}">${title ? `\n<p class="block-title">${title}</p>` : ''}\n`;
      } else {
        // closing tag
        return '</div>\n';
      }
    };
  }
}

function getRenderOptions(type: any) {
  const ARG_REG = new RegExp(`^${type}\\s*(.*?)$`);
  return {
    validate: (params) => params.trim().match(ARG_REG) !== null,
    render: getRenderFunction(type, ARG_REG)
  }
}



export function extendMarkdownIt(md: any) {
  const { parse, renderer } = md
  const { render } = renderer

  md.parse = (markdown: string, env: any) => {
    // Generate tokens by Marp if enabled
    if (detectMarpFromMarkdown(markdown)) {
      // A messy resolution by finding matched document to resolve workspace or directory of Markdown
      // https://github.com/microsoft/vscode/issues/84846
      const baseFolder: Uri | undefined = (() => {
        for (const document of workspace.textDocuments) {
          if (
            document.languageId === 'markdown' &&
            document.getText().replace(/\u2028|\u2029/g, '') === markdown
          ) {
            return Themes.resolveBaseDirectoryForTheme(document)
          }
        }
        return undefined
      })()

      let marp = new Marp(marpCoreOptionForPreview(md.options))
        .use(customTheme)
        .use(outline)
        .use(lineNumber)

      // major update, add `markdown-it-container`
      const addContainerBox = (marp, tagName, className, modify = x => x) => {
        const re = new RegExp(`^${tagName}:?(.*)$`);
        const boxClass = `block ${className === "block" ? "" : className}`;
        const headClass = `block-head ${className === "block" ? "" : className + "-head"}`;
        marp.use(mdc, tagName, {
          validate: (params) => {
            return params.trim().match(re);
          },
          render: (tokens, idx) => {
            const m = tokens[idx].info.trim().match(re);
            const name = modify(m ? m[1] : "");
            if (tokens[idx].nesting === 1) {
              let ret = `<div class="${boxClass}">`;
              if (name) {
                ret += `<p class="${headClass}">${name}</p>`;
              }
              ret += `\n`;
              return ret;
            } else {
              return `</div>\n`;
            }
          }
        });
      };
      
      addContainerBox(marp, "block", "block");
      addContainerBox(marp, "black", "block");
      addContainerBox(marp, "info", "info", name => name || "info");
      addContainerBox(marp, "blue", "info", name => name || "info");
      addContainerBox(marp, "warn", "warn", name => name || "warn");
      addContainerBox(marp, "red", "warn", name => name || "warn");
      addContainerBox(marp, "footnote", "footnote");

      // const containerTypes = ['tip', 'warning', 'info', 'details'];
      // containerTypes.forEach(type => {
      //   marp = marp.use(mdc, type, getRenderOptions(type));
      //   // md = md.use(mdc, type, getRenderOptions(type));
      // });

      // Switch rules
      if (!(marpConfiguration().get<boolean>('outlineExtension') ?? true)) {
        marp.markdown.disable(outlineRule)
      }

      // Load custom themes
      Promise.all(
        themes.loadStyles(baseFolder).map((p) =>
          p.then(
            (theme) => theme.registered,
            (e) => console.error(e)
          )
        )
      ).then((registered) => {
        if (registered.some((f) => f === true)) {
          commands.executeCommand('markdown.preview.refresh')
        }
      })

      for (const theme of themes.getRegisteredStyles(baseFolder)) {
        try {
          marp.themeSet.add(theme.css)
        } catch (e) {
          const msg = e instanceof Error ? ` (${e.message})` : ''

          console.error(
            `Failed to register custom theme from "${theme.path}".${msg}`
          )
        }
      }

      // Use image stabilizer and link normalizer from VS Code
      marp.markdown.renderer.rules.image = md.renderer.rules.image
      marp.markdown.normalizeLink = md.normalizeLink

      // validateLink prefers Marp's default. If overridden by VS Code's it,
      // does not return compatible result with the other Marp tools.
      // marp.markdown.validateLink = md.validateLink

      md[marpVscode] = marp
      return marp.markdown.parse(markdown, env)
    }

    // Fallback to original instance if Marp was not enabled
    md[marpVscode] = false
    return parse.call(md, markdown, env)
  }

  renderer.render = (tokens: any[], options: any, env: any) => {
    const marp = md[marpVscode]

    if (marp) {
      const { markdown } = marp
      const style = marp.renderStyle(marp.lastGlobalDirectives.theme)
      const html = markdown.renderer.render(tokens, markdown.options, env)

      return `<style id="__marp-vscode-style">${style}</style>${html}`
    }

    return render.call(renderer, tokens, options, env)
  }

  return md
}

export const activate = ({ subscriptions }: ExtensionContext) => {
  diagnostics(subscriptions)
  languageProvider(subscriptions)

  subscriptions.push(
    commands.registerCommand(exportCommand.command, exportCommand.default),
    commands.registerCommand(newMarpMarkdown.command, newMarpMarkdown.default),
    commands.registerCommand(
      openExtensionSettings.command,
      openExtensionSettings.default
    ),
    commands.registerCommand(showQuickPick.command, showQuickPick.default),
    commands.registerCommand(
      toggleMarpFeature.command,
      toggleMarpFeature.default
    ),
    themes,
    workspace.onDidChangeConfiguration((e) => {
      if (shouldRefreshConfs.some((c) => e.affectsConfiguration(c))) {
        applyRefreshedConfiguration()
      }
    }),
    workspace.onDidGrantWorkspaceTrust(applyRefreshedConfiguration)
  )

  return { extendMarkdownIt }
}
