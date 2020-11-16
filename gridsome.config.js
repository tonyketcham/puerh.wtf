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

  templates: {
    Tasting: '/:tea_name',
  },

  plugins: [
    {
      use: '@gridsome/source-filesystem',
      options: {
        path: 'content/tastings/*.md',
        typeName: 'Tasting',
        remark: {
          plugins: [
            // ...local plugins
          ],
        },
      },
    },
    {
      use: `gridsome-plugin-netlify-cms`,
      options: {
        publicPath: `/admin`,
      },
    },
  ],
};
