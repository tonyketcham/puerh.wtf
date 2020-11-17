// This is where project configuration and plugin options are located.
// Learn more: https://gridsome.org/docs/config

// Changes here require a server restart.
// To restart press CTRL + C in terminal and run `gridsome develop`

module.exports = {
  siteName: 'Puerh.wtf',
  transformers: {
    remark: {
      externalLinksTarget: '_blank',
      externalLinksRel: ['nofollow', 'noopener', 'noreferrer'],
      anchorClassName: 'icon icon-link',
      plugins: [
        // ...global plugins
      ],
    },
  },

  // templates: {
  //   Tasting: '/:tea_name',
  // },

  plugins: [
    {
      use: '@gridsome/source-filesystem',
      options: {
        path: 'content/tastings/*.md',
        typeName: 'Tasting',
        // route: '/tastings/:year/:slug',
        refs: {
          author: 'Author',
          genre: 'Genre',
          cultivar: 'Cultivar',
          origin: 'Origin',
          vendor: 'Vendor',
        },
      },
    },
    {
      use: '@gridsome/source-filesystem',
      options: {
        path: 'content/authors/*.md',
        typeName: 'Author',
        // route: '/genres/:slug',
      },
    },
    {
      use: '@gridsome/source-filesystem',
      options: {
        path: 'content/categories/*.md',
        typeName: 'Category',
        // route: '/genres/:slug',
      },
    },
    {
      use: '@gridsome/source-filesystem',
      options: {
        path: 'content/genres/*.md',
        typeName: 'Genre',
        // route: '/genres/:slug',
        refs: {
          category: 'Category',
        },
      },
    },
    {
      use: '@gridsome/source-filesystem',
      options: {
        path: 'content/cultivars/*.md',
        typeName: 'Cultivar',
      },
    },
    {
      use: '@gridsome/source-filesystem',
      options: {
        path: 'content/origins/*.md',
        typeName: 'Origin',
      },
    },
    {
      use: '@gridsome/source-filesystem',
      options: {
        path: 'content/vendors/*.md',
        typeName: 'Vendor',
      },
    },
    {
      use: 'gridsome-plugin-netlify-cms',
      options: {
        publicPath: '/admin',
        // htmlPath: './static/admin/index.html',
        // configPath: './static/admin/config.yml',
        // modulePath: './static/admin/index.js',
      },
    },
  ],
};
