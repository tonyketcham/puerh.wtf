// This is the main.js file. Import global CSS and scripts here.
// The Client API can be used here. Learn more: gridsome.org/docs/client-api
import VueLazyload from 'vue-lazyload';
import '~/styles/Global.postcss';

export default function (Vue) {
  // Set default layout as a global component
  // Vue.config.errorHandler = function (err, vm) {
  //   console.log(err, vm.$options);
  // };

  // const cdn = 'res.cloudinary.com/';
  // const mediaGlobals = 'pu-erh/image/upload/';
  // const afterMediaGlobals = new RegExp(`(?<=${mediaGlobals}).+`);

  Vue.use(VueLazyload, {
    lazyComponent: true,
    // filter: {
    //   progressive(listener) {
    //     const transformations = 'f_auto/';
    //     const imageURL = listener.src;

    //     if (new RegExp(cdn).test(imageURL)) {
    //       listener.el.setAttribute('lazy-progressive', 'true');

    //       const imageAsset = imageURL.match(afterMediaGlobals);
    //       // Transformed preview image for cloudinary
    //       listener.loading =
    //         'https://' + cdn + mediaGlobals + transformations + imageAsset;
    //     }
    //   },
    //   webp(listener, options) {
    //     const transformations = 'f_webp/';
    //     const imageURL = listener.src;
    //     if (!options.supportWebp) return;
    //     if (new RegExp(cdn).test(imageURL)) {
    //       listener.el.setAttribute('lazy-progressive', 'true');

    //       const imageAsset = imageURL.match(afterMediaGlobals);
    //       // Transformed preview image for cloudinary
    //       listener.src =
    //         'https://' + cdn + mediaGlobals + transformations + imageAsset;
    //     }
    //   },
    // },
  });
}
