import { Schema } from 'prosemirror-model';

/**
 * ProseMirror schema for DailyNote editor
 * Supports: text formatting, links, images, checkboxes, horizontal rules
 */
export const schema = new Schema({
  nodes: {
    doc: {
      content: 'block+'
    },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }, { tag: 'div' }],
      toDOM: () => ['p', 0]
    },
    text: {
      group: 'inline'
    },
    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br']
    },
    horizontal_rule: {
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM: () => ['hr']
    },
    image: {
      inline: true,
      group: 'inline',
      attrs: {
        imageId: {},
        alt: { default: '' },
        width: { default: null },
        height: { default: null }
      },
      parseDOM: [{
        tag: 'img[data-image-id]',
        getAttrs: (dom) => {
          const element = dom as HTMLElement;
          return {
            imageId: element.getAttribute('data-image-id'),
            alt: element.getAttribute('alt') || '',
            width: element.getAttribute('width') || null,
            height: element.getAttribute('height') || null
          };
        }
      }],
      toDOM: (node) => ['img', {
        'data-image-id': node.attrs.imageId,
        alt: node.attrs.alt,
        width: node.attrs.width,
        height: node.attrs.height
      }]
    },
    checkbox: {
      inline: true,
      group: 'inline',
      attrs: {
        checked: { default: false }
      },
      parseDOM: [{
        tag: 'input[type="checkbox"]',
        getAttrs: (dom) => {
          const element = dom as HTMLInputElement;
          return {
            checked: element.checked
          };
        }
      }],
      toDOM: (node) => ['input', {
        type: 'checkbox',
        checked: node.attrs.checked ? 'checked' : null
      }]
    }
  },
  marks: {
    bold: {
      parseDOM: [
        { tag: 'strong' },
        { tag: 'b' },
        { style: 'font-weight', getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value as string) && null }
      ],
      toDOM: () => ['strong', 0]
    },
    italic: {
      parseDOM: [
        { tag: 'em' },
        { tag: 'i' },
        { style: 'font-style=italic' }
      ],
      toDOM: () => ['em', 0]
    },
    underline: {
      parseDOM: [
        { tag: 'u' },
        { style: 'text-decoration=underline' }
      ],
      toDOM: () => ['u', 0]
    },
    strike: {
      parseDOM: [
        { tag: 's' },
        { tag: 'strike' },
        { tag: 'del' },
        { style: 'text-decoration=line-through' }
      ],
      toDOM: () => ['s', 0]
    },
    link: {
      attrs: {
        href: {},
        title: { default: null }
      },
      inclusive: false,
      parseDOM: [{
        tag: 'a[href]',
        getAttrs: (dom) => {
          const element = dom as HTMLElement;
          return {
            href: element.getAttribute('href'),
            title: element.getAttribute('title')
          };
        }
      }],
      toDOM: (mark) => ['a', {
        href: mark.attrs.href,
        title: mark.attrs.title,
        target: '_blank',
        rel: 'noopener noreferrer'
      }, 0]
    }
  }
});
