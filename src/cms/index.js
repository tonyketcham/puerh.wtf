import CMS from 'netlify-cms';
import { youtubeControl, youtubePreview } from 'netlify-cms-widget-youtube';
import { IdControl, IdPreview } from './id-widget';

console.log('Welcome to tea town brother');
// Register the widget. This lets NetlifyCMS know about our custom widget
CMS.registerWidget('youtube', youtubeControl, youtubePreview);

// Register the widget. This lets NetlifyCMS know about our custom widget
CMS.registerWidget('id', IdControl, IdPreview);
