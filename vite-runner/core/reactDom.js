import react from "./react.js";

const ReactDom = {
  creatRoot(container) {
    return {
      render(App) {
        react.render(App, container);
      },
    };
  },
};

export default ReactDom;
