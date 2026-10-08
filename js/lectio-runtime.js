class DCLogic {
  constructor() {
    this.state = {};
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    if (typeof this.render === 'function') {
      this.render();
    }
  }
}

class Component extends DCLogic {
  constructor() {
    super();
    this.root = document.querySelector('#view');
    if (!this.root) return;
    this.render();
  }

  renderVals() {
    return this.state;
  }

  render() {
    if (!this.root) return;
    const html = this.root.innerHTML;
    const data = this.renderVals();
    let output = html;

    output = output.replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
      const value = key.split('.').reduce((acc, part) => acc && acc[part], data);
      return value === undefined || value === null ? '' : String(value);
    });

    output = output.replace(/<sc-if\s+value="{{([^\"]+)}}"\s*>([\s\S]*?)<\/sc-if>/g, (_, key, inner) => {
      const value = key.split('.').reduce((acc, part) => acc && acc[part], data);
      return value ? inner : '';
    });

    output = output.replace(/<sc-for\s+list="{{([^\"]+)}}"\s+as="([^"]+)"\s*>([\s\S]*?)<\/sc-for>/g, (_, listKey, alias, inner) => {
      const list = listKey.split('.').reduce((acc, part) => acc && acc[part], data) || [];
      return list.map((item) => {
        const scoped = { ...data, [alias]: item };
        return inner.replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
          const value = key.split('.').reduce((acc, part) => acc && acc[part], scoped);
          return value === undefined || value === null ? '' : String(value);
        });
      }).join('');
    });

    this.root.innerHTML = output;

    this.root.querySelectorAll('[onClick]').forEach((node) => {
      const fnName = node.getAttribute('onClick');
      const handler = this[fnName];
      if (typeof handler === 'function') {
        node.onclick = (event) => handler.call(this, event);
      }
      node.removeAttribute('onClick');
    });
  }
}

window.DCLogic = DCLogic;
window.Component = Component;
