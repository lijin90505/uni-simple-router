import HoldTabbar from 'uni-hold-tabbar';
import {
    proxyLaunchHook, beforeBackHooks, beforeTabHooks, backApiCallHook,
} from './hooks';
import { Global } from '../helpers/config';
import { getPages, assertCanBack } from './util';
import { pageNavFinish } from './uniNav';
import { warn } from '../helpers/warn';

/**
 * 创建底部菜单拦截
 * @param {Object} Router  当前路由对象
 */
const createdHoldTab = function (Router) {
    const { holdTabbarStyle } = Router.CONFIG.APP;	// 获取app所有配置
    const holdTab = new HoldTabbar({
        style: holdTabbarStyle.call(Router),
        event: {
            click: (index, { pagePath }) => {
                beforeTabHooks.call(Router, pagePath);
            },
        },
    });
    Global.$holdTab = holdTab;
};
/**
 * uni-app 重写共用的方法
 * @param {Object} object 开发者传递的相关参数
 * @param {Object} callFun 需要执行的uni方法
 */
export const uniRewritePublicFun = function (object, finishFun, callFun) {
    const page = getPages(-2);
    const { complete } = object;	// 获取到开发者传递的complete事件
    if (complete) {		// 有写此函数的时候
        object.complete = function (arg) {
            if (finishFun) {
                finishFun('pageShow', page.route);
            }
            complete.call(page.$vm, arg);
        };
    } else { // 没有写次函数
        object.complete = function () {
            if (finishFun) {
                finishFun('pageShow', page.route);
            }
        };
    }
    if (Global.$holdTab.isVisible) {
        Global.$holdTab.hideHoldTab();	// 先隐藏底部tabbar拦截器
    }
    if (callFun) {
        callFun(object);
    }
};

/**
 * 重写掉uni-app的 uni.getLocation 和 uni.chooseLocation APi
 * @param {Boolean}  rewriteFun 是否重写方法
 */
export const rewriteUniFun = function (rewriteFun) {
    if (rewriteFun === false) {
        return false;
    }
    const oldChooseLocation = uni.chooseLocation; // 打开地图选择位置
    const oldOpenLocation = uni.openLocation;	// 打开内置地图
    uni.chooseLocation = function (object) {
        uniRewritePublicFun(object, pageNavFinish, oldChooseLocation);
    };
    uni.openLocation = function (object) {
        uniRewritePublicFun(object, () => {
            const webViews = plus.webview.all();
            const webview = webViews[webViews.length - 1];
            webview.addEventListener('close', () => {
                const page = getPages(-2);
                pageNavFinish('pageShow', page.route);
            }, false);
        }, oldOpenLocation);
    };
};

/**
 * 对当前app做一个动画页面 用来过渡首次next 等待时间过长的尴尬
 * @param {Object} Router 当前路由对象
 */
export const registerLoddingPage = function (Router) {
    const { loddingPageHook, loddingPageStyle } = Router.CONFIG.APP;	// 获取app所有配置
    const view = new plus.nativeObj.View('router-loadding', {
        top: '0px',
        left: '0px',
        height: '100%',
        width: '100%',
        ...loddingPageStyle.call(Router),
    });
    loddingPageHook.call(Router, view);	// 触发等待页面生命周期
    view.show();
};
/**
 * 移除当前 页面上 非router 声明的 onBackPress 事件
 * @param {Object} page 当前 vue 组件对象
 * @param {Object} options	当前page对象的 $options
 * 修复 https://github.com/SilurianYang/uni-simple-router/issues/106
 */
export const removeBackPressEvent = function (page, options) {
    const isBack = assertCanBack(page);
    if (isBack) {	// 可返回
        options.onBackPress = [options.onBackPress[0]];		// 路由混入的都干掉
    }
};
/**
 * 判断当前页面是否需要拦截返回
 *
 * @param {Object} page 当前 vue 组件对象
 * @param {Object} options 当前 vue 组件对象下的$options对象
 * @param {Array} args  当前页面是点击头部返回还是底部返回
 * 修复 https://github.com/SilurianYang/uni-simple-router/issues/66
 *
 * this 为当前 Router 对象
 */
export const pageIsHeadBack = function (page, options, args) {
    if (args[0].from == 'navigateBack') {		// 调用api返回
        if (Global.LockStatus) { // 正在跳转的时候 返回按键按的太快啦
            warn('当前页面正在处于跳转状态，请稍后再进行跳转....');
            return true;
        }
        Global.LockStatus = true; // 设置为锁住状态
        backApiCallHook.call(this, options, args);
        return true;
    }
    const isBack = assertCanBack(page);
    if (isBack) {	// 可返回
        if (Global.LockStatus) { // 正在跳转的时候 返回按键按的太快啦
            warn('当前页面正在处于跳转状态，请稍后再进行跳转....');
            return true;
        }
        Global.LockStatus = true; // 设置为锁住状态
        beforeBackHooks.call(this, options, args);
        return true;
    }
    return false;
};

/**
 * 开始初始化app端路由配置
 *
 * @param {Object} Router
 *
 * this 为当前 page 对象
 */
export const appInit = function (Router) {
    proxyLaunchHook.call(this);
    const { holdTabbar, rewriteFun } = Router.CONFIG.APP;
    if (holdTabbar) {
        rewriteUniFun(rewriteFun);
        createdHoldTab(Router);
    }
    registerLoddingPage(Router);
};
