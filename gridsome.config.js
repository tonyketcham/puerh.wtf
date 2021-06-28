// This is where project configuration and plugin options are located.
// Learn more: https://gridsome.org/docs/config

// Changes here require a server restart.
// To restart press CTRL + C in terminal and run `gridsome develop`

module.exports = {
  siteName: 'Puerh.wtf',
  icon: {
    favicon: {
      src: './src/android-chrome-512x512.png',
    },
    touchicon: {
      src: './src/apple-touch-icon.png',
      precomposed: true,
    },
  },
  templates: {
    Tasting: '/sessions/:year/:month/:title',
    Category: '/categories/:title',
    Author: '/drinker/:title',
    Style: '/categories/:category/:title',
    Varietal: '/varietal/:title',
    Origin: '/origin/:title',
    Vendor: '/vendor/:title',
    Tags: '/tags/:title',
  },
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
  plugins: [
    {
      use: 'gridsome-plugin-tailwindcss',
      options: {
        tailwindConfig: './tailwind.config.js',
      },
    },
    {
      use: '@gridsome/source-filesystem',
      options: {
        path: 'content/tastings/*.md',
        typeName: 'Tasting',
        refs: {
          author: 'Author',
          style: 'Style',
          cultivar: 'Cultivar',
          origin: 'Origin',
          vendor: 'Vendor',
          tags: 'Tags',
        },
      },
    },
    {
      use: '@gridsome/source-filesystem',
      options: {
        path: 'content/authors/*.md',
        typeName: 'Author',
        // route: '/styles/:slug',
      },
    },
    {
      use: '@gridsome/source-filesystem',
      options: {
        path: 'content/categories/*.md',
        typeName: 'Category',
        // route: '/styles/:slug',
      },
    },
    {
      use: '@gridsome/source-filesystem',
      options: {
        path: 'content/styles/*.md',
        typeName: 'Style',
        // route: '/styles/:slug',
        refs: {
          category: 'Category',
        },
      },
    },
    {
      use: '@gridsome/source-filesystem',
      options: {
        path: 'content/cultivars/*.md',
        typeName: 'Varietal',
        refs: {
          style: 'Style',
        },
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
        path: 'content/tags/*.md',
        typeName: 'Tags',
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
        modulePath: `src/cms/index.js`,
        configPath: `src/cms/config.yml`,
        publicPath: `/cms`,
        htmlTitle: `Tea CMS`,
      },
    },
  ],
};
