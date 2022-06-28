import '~/styles/Global.postcss';
import Layout from '~/layouts/Default.vue';

// Vue Tippy - tooltips
import VueTippy, { TippyComponent } from 'vue-tippy';

// import smoothscroll from 'smoothscroll-polyfill';
// smoothscroll.polyfill();

import VueMobileDetection from 'vue-mobile-detection';

export default function (Vue) {
  // Layout
  Vue.component('Layout', Layout);

  // Tooltips
  Vue.use(VueTippy, {
    placement: 'left',
    arrow: true,
    boundary: 'viewport',
    duration: 200,
    delay: [0, 20],
    inertia: true,
    size: 'small',
  });
  Vue.component('tippy', TippyComponent);

  Vue.use(VueMobileDetection);
}
