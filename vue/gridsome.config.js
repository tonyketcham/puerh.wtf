// This is where project configuration and plugin options are located.
// Learn more: https://gridsome.org/docs/config

// Changes here require a server restart.
// To restart press CTRL + C in terminal and run `gridsome develop`
// import slugify from 'slugify';
const slugify = require('slugify');
const slugSettings = {
  remove: /[*+~.,()'"!:@]/g,
};

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
    Tasting: [
      {
        path: (node) => {
          // Split apart date & format it
          const occurredOn = new Date(node.date);
          const year = occurredOn.getFullYear();
          const month = String(occurredOn.getMonth() + 1).padStart(2, '0');

          // Get title
          const slug = slugify(node.title, slugSettings);

          return `/sessions/${year}/${month}/${slug}-${node.production_year}`;
        },
      },
    ],
    Category: '/categories/:title',
    Author: '/drinker/:title',
    Style: '/categories/:category/:title',
    Varietal: '/varietal/:title',
    Origin: [
      {
        path: (node) => {
          const country =
            slugify(node?.country ?? '', slugSettings) ?? 'unknown';
          const municipality =
            slugify(node?.municipality ?? '', slugSettings) ?? 'unknown';
          const location = slugify(node?.location ?? '', slugSettings);

          return `/origin/${country}/${municipality}/${location}`;
        },
      },
    ],
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
        shouldTimeTravel: true,
        presetEnvConfig: {
          autoprefixer: true,
        },
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
          cultivar: 'Varietal',
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
