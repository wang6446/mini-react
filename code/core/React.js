//创建文本节点的虚拟dom
function createTextNode(text) {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: [],
    },
  };
}
//创建标签节点的虚拟dom
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) => {
        const isTextNode =
          typeof child === "string" || typeof child === "number";
        return isTextNode ? createTextNode(child) : child;
      }),
    },
  };
}
//render函数构建初始化根节点虚拟dom
function render(el, container) {
  wipRoot = {
    dom: container,
    props: {
      children: [el],
    },
  };

  nextWorkOfUnit = wipRoot;
}

let wipRoot = null; //执行performWorkOfUnit函数的根节点对象
let nextWorkOfUnit = null; //每次while循环需要去执行的对象(子->兄弟->父亲的兄弟(一直向上查找))
let deletions = []; //用于批量卸载老节点的真实dom
let wipFiber = null; //表示当前函数式组件这个虚拟dom节点对象
//根据requestIdleCallback这一API进行任务调度器，将任务细分化解决之前递归调用造成的dom卡顿问题——任务调度器函数
function workLoop(deadline) {
  let shouldYield = false;
  while (!shouldYield && nextWorkOfUnit) {
    nextWorkOfUnit = performWorkOfUnit(nextWorkOfUnit);
    //这里作判断是因为，如果只是更新了一个函数式组件当中的一些数据，并不需要进行全局更新这样会耗费大量资源
    //所以做节点开始和结束的判定提前结束循环
    if (wipRoot?.sibling?.type === nextWorkOfUnit?.type) {
      nextWorkOfUnit = undefined;
    }
    // deadline.timeRemaining()< 1表示浏览器没有闲置时间此时不做循环工作处理，跳出循环
    shouldYield = deadline.timeRemaining() < 1;
  }
  //如果最后一个节点没有值了就进行commitRoot,这个函数在dom挂载以前，在虚拟dom完成构建以后，可以进行一些数据处理和操作
  if (!nextWorkOfUnit && wipRoot) {
    commitRoot();
  }

  requestIdleCallback(workLoop);
}
//在dom挂载以前，在虚拟dom完成构建以后，可以进行一些数据处理和操作
function commitRoot() {
  //循环删除老节点的真实dom
  deletions.forEach(commitDeletion);
  //进行真实dom的挂载
  commitWork(wipRoot.child);
  //进行commitEffectHooks函数调用,调用时机是在 React 完成对 DOM 的渲染之后，并且浏览器完成绘制之前。
  commitEffectHooks();
  wipRoot = null;
  deletions = [];
}
//实现Effect功能，接受两个参数分别是一个函数和一个数组，函数初始化时会执行一次，数组里面的内容为空或者是没变化就不再次执行这一函数
//cleanup在effect调用之前调用，目的是为了清除副作用
function commitEffectHooks() {
  //实现Effect功能
  function run(fiber) {
    if (!fiber) return;
    //没有老节点说明是第一次初始化init
    if (!fiber.alternate) {
      fiber.effectHooks?.forEach((hook) => {
        //执行参数中的函数并收集函数的返回值(函数)
        hook.cleanup = hook.callback();
      });
    }
    //有老节点说明是可能需要执行更新函数
    else {
      // update
      // deps 有没有发生改变
      fiber.effectHooks?.forEach((newHook, index) => {
        //前提:数组长度大于0
        if (newHook.deps.length > 0) {
          //拿到数组中的某一个对象
          const oldEffectHook = fiber.alternate?.effectHooks[index];

          // some 数组当中有一个值发生变化就需要执行更新函数
          const needUpdate = oldEffectHook?.deps.some((oldDep, i) => {
            return oldDep !== newHook.deps[i];
          });
          //收集函数的返回值并执行更新函数
          needUpdate && (newHook.cleanup = newHook.callback());
        }
      });
    }
    run(fiber.child);
    run(fiber.sibling);
  }
  //实现Cleanup功能
  function runCleanup(fiber) {
    if (!fiber) return;

    fiber.alternate?.effectHooks?.forEach((hook) => {
      //前提:数组长度大于0
      if (hook.deps.length > 0) {
        //执行cleanup函数
        hook.cleanup && hook.cleanup();
      }
    });
    runCleanup(fiber.child);
    runCleanup(fiber.sibling);
  }
  //cleanup执行要在effect执行前
  runCleanup(wipRoot);
  run(wipRoot);
}
//卸载老节点的真实dom方法
function commitDeletion(fiber) {
  //利用循环向上查找父dom通过API:removeChild去卸载子dom
  if (fiber.dom) {
    let fiberParent = fiber.parent;
    while (!fiberParent.dom) {
      fiberParent = fiberParent.parent;
    }
    fiberParent.dom.removeChild(fiber.dom);
  } else {
    commitDeletion(fiber.child);
  }
}
//执行真实dom的挂载方法
function commitWork(fiber) {
  if (!fiber) return;
  //利用循环向上查找父dom通过API去挂载子dom
  let fiberParent = fiber.parent;
  while (!fiberParent.dom) {
    fiberParent = fiberParent.parent;
  }
  //这里用到提前定义好的effectTag属性，去优化避免不必要的dom挂载
  //effectTag属性为update表示dom没有改变只是需要更新dom上面的props属性
  if (fiber.effectTag === "update") {
    updateProps(fiber.dom, fiber.props, fiber.alternate?.props);
  }

  //effectTag属性为placement表示dom需要重新挂载
  else if (fiber.effectTag === "placement") {
    if (fiber.dom) {
      fiberParent.dom.append(fiber.dom);
    }
  }
  commitWork(fiber.child);
  commitWork(fiber.sibling);
}
//根据传入的type的不同去创建文本节点类型的真实dom或者是标签节点类型的真实dom
function createDom(type) {
  return type === "TEXT_ELEMENT"
    ? document.createTextNode("")
    : document.createElement(type);
}
//更新真实dom上的属性
function updateProps(dom, nextProps, prevProps) {
  // 1. old 有  new 没有 删除
  Object.keys(prevProps).forEach((key) => {
    if (key !== "children") {
      if (!(key in nextProps)) {
        dom.removeAttribute(key);
      }
    }
  });
  // 2. new 有 old 没有 添加
  // 3. new 有 old 有 修改
  Object.keys(nextProps).forEach((key) => {
    if (key !== "children") {
      if (nextProps[key] !== prevProps[key]) {
        //如果是事件监听
        if (key.startsWith("on")) {
          const eventType = key.slice(2).toLowerCase();

          dom.removeEventListener(eventType, prevProps[key]);

          dom.addEventListener(eventType, nextProps[key]);
        }
        //普通属性添加
        else {
          dom[key] = nextProps[key];
        }
      }
    }
  });
}
//此方法是构建虚拟dom对象的核心,涉及到性能优化和链表关系建立
function reconcileChildren(fiber, children) {
  //先查看是否有老节点的儿子
  let oldFiber = fiber.alternate?.child;
  //建立上一个孩子节点用于给孩子节点数组遍历时赋值给sibling兄弟属性
  let prevChild = null;
  children.forEach((child, index) => {
    //老节点和新节点是否类型相同
    const isSameType = oldFiber && oldFiber.type === child.type;
    let newFiber;
    //相同做更新操作
    if (isSameType) {
      // update
      newFiber = {
        type: child.type,
        props: child.props,
        child: null, //指向其孩子节点的虚拟dom对象
        parent: fiber, //指向其父亲节点的虚拟dom对象
        sibling: null, //指向其兄弟节点的虚拟dom对象
        dom: oldFiber.dom, //此对象对应的真实dom
        effectTag: "update", //用于挂载时进行性能优化
        alternate: oldFiber, //建立链表关系，alternate属性指向老节点
      };
    }
    //不相同做初始化操作
    else {
      if (child) {
        newFiber = {
          type: child.type,
          props: child.props,
          child: null,
          parent: fiber,
          sibling: null,
          dom: null,
          effectTag: "placement",
        };
      }
      //在这里将老节点push到删除数组中
      if (oldFiber) {
        deletions.push(oldFiber);
      }
    }
    //此时虚拟dom对象构建完成需要更新相关数据
    //老节点存在，老节点更新为其兄弟节点
    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }
    //第一个孩子节点直接赋值即可
    if (index === 0) {
      fiber.child = newFiber;
    }
    //后面的孩子节点赋值给前一个孩子节点的sibling属性
    else {
      prevChild.sibling = newFiber;
    }
    //新节点存在，孩子节点更新为新节点
    if (newFiber) {
      prevChild = newFiber;
    }
  });
  //oldFiber还存在需要做处理
  while (oldFiber) {
    deletions.push(oldFiber);
    oldFiber = oldFiber.sibling;
  }
}
//更新函数式组件的方法，不需要创建真实dom
function updateFunctionComponent(fiber) {
  //初始化effect和usestate需要的变量
  stateHooks = [];
  stateHookIndex = 0;
  effectHooks = [];
  //更新wipFiber即表示当前函数式组件这个虚拟dom节点对象
  wipFiber = fiber;
  //函数式组件的虚拟dom对象的特殊式处理拿到其children数组，传给reconcileChildren函数
  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
}
//更新正常组件的方法
function updateHostComponent(fiber) {
  //没有dom需要创建真实dom
  if (!fiber.dom) {
    const dom = (fiber.dom = createDom(fiber.type));
    updateProps(dom, fiber.props, {});
  }
  //拿到其props中的children数组，传给reconcileChildren函数
  const children = fiber.props.children;
  reconcileChildren(fiber, children);
}
//改造虚拟dom的核心方法，按照子->兄弟->父亲的兄弟(找不到向上一直找父亲的父亲查找)的原则
function performWorkOfUnit(fiber) {
  const isFunctionComponent = typeof fiber.type === "function";

  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }

  // 4. 返回下一个要执行的任务
  if (fiber.child) {
    return fiber.child;
  }

  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) return nextFiber.sibling;
    nextFiber = nextFiber.parent;
  }
}
//正式开启workLoop函数任务调度器
requestIdleCallback(workLoop);
//在函数式组件中去更新本身这个组件里面的数据驱动
function update() {
  let currentFiber = wipFiber;
  return () => {
    //重新赋值根节点的虚拟dom对象，只对函数式组件这一部分进行更新
    wipRoot = {
      ...currentFiber,
      alternate: currentFiber,
    };

    nextWorkOfUnit = wipRoot;
  };
}

let stateHooks; //存放stateHook对象的数组，设计成数组是为了多个useState使用
let stateHookIndex; //存放stateHook对象的数组的索引
//useState功能模块的核心函数,接受一个变量的初始化值，对这个变量进行数据托管
function useState(initial) {
  let currentFiber = wipFiber;
  //查找是否有老hook对象，有就赋值没有就初始化
  const oldHook = currentFiber.alternate?.stateHooks[stateHookIndex];
  const stateHook = {
    state: oldHook ? oldHook.state : initial,
    queue: oldHook ? oldHook.queue : [],
  };
  //将数组里面的方法进行调用，返回值赋值给state实现数据更新
  stateHook.queue.forEach((action) => {
    stateHook.state = action(stateHook.state);
  });
  //重置queue数组
  stateHook.queue = [];
  //数组加入stateHook对象，索引也要跟着+1
  stateHookIndex++;
  stateHooks.push(stateHook);

  //给虚拟dom对象上赋值stateHooks属性
  currentFiber.stateHooks = stateHooks;

  //返回的数组第二个元素setState方法用于用于去改变数据托管的那个变量
  function setState(action) {
    //看用户传入的数据是否是一个方法，是就调用这个方法并把state值作为参数传入，不是方法就直接取这个值
    const eagerState =
      typeof action === "function" ? action(stateHook.state) : action;
    //值没有变化就返回不做处理
    if (eagerState === stateHook.state) return;
    //将方法加入stateHook的queue中等待调用
    stateHook.queue.push(typeof action === "function" ? action : () => action);
    //更新wipRoot值
    wipRoot = {
      ...currentFiber,
      alternate: currentFiber,
    };

    nextWorkOfUnit = wipRoot;
  }
  //将stae值和setState函数包在数组里面返回
  return [stateHook.state, setState];
}

let effectHooks; //装着effectHook对象的数组
//接受一个函数和数组，并定义effectHook对象将其赋值在wipFiber上
function useEffect(callback, deps) {
  const effectHook = {
    callback,
    deps,
    cleanup: undefined,
  };
  effectHooks.push(effectHook);

  wipFiber.effectHooks = effectHooks;
}

const React = {
  update,
  useEffect,
  useState,
  render,
  createElement,
};

export default React;
