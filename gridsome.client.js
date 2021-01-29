import store from './src/store/index';

export default function (Vue, options, context) {
  context.appOptions.store = store;
}
