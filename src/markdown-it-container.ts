// import { Marp } from '@marp-team/marp-core'
import * as mdc from 'markdown-it-container'

export function getRenderFunction(type: any, arg_reg: any) {
  if (type === "details") {
    return (tokens: any[], idx: any) => {
      if (tokens[idx].nesting === 1) {
        // opening tag
        const title = tokens[idx].info.trim().match(arg_reg)[1];
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
        const title = tokens[idx].info.trim().match(arg_reg)[1];
        // title = escapeHtml(title);
        return `<div class="block ${type}">${title ? `\n<p class="block-title">${title}</p>` : ''}\n`;
      } else {
        // closing tag
        return '</div>\n';
      }
    };
  }
}

// major update, add `markdown-it-container`
export function addContainerBox(marp, tagName, className, modify = x => x){
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
