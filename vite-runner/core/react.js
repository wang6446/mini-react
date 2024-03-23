// const textEl = {
//   type: "text_element",
//   props: {
//     nodeValue: "app",
//     children: [],
//   },
// };

// const el = {
//   type: "div",
//   props: {
//     id: "app",
//     children: textEl,
//   },
// };

// const dom = document.createElement(app.type); //公共的部分 创建  赋属性值  插入dom所以需要加入render函数进来
// dom.id = app.props.id;
// document.getElementById("root").append(dom);
// const textNode = document.createTextNode("");
// textNode.nodeValue = textEl.props.nodeValue;
// dom.append(textNode);

// render(App, document.getElementById("root"));

function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((item) => {
        return typeof item === "string" ? createTextNode(item) : item;
      }),
    },
  };
}
function createTextNode(text) {
  return {
    type: "text_element",
    props: {
      nodeValue: text,
      children: [],
    },
  };
}

function render(el, container) {
  const dom =
    el.type === "text_element"
      ? document.createTextNode("")
      : document.createElement(el.type);

  Object.keys(el.props).forEach((item) => {
    if (item !== "children") {
      dom[item] = el.props[item];
    }
  });

  const children = el.props.children;
  children.forEach((item) => {
    render(item, dom);
  });

  container.append(dom);
}

const React = {
  createElement,
  render,
};
export default React;
