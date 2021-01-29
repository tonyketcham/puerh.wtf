// This is the main.js file. Import global CSS and scripts here.
// The Client API can be used here. Learn more: gridsome.org/docs/client-api

export default function (Vue) {
  // Set default layout as a global component
  Vue.config.errorHandler = function (err, vm) {
    console.log(err, vm.$options);
  };
}
