import CMS from 'netlify-cms-app';
import { IdControl, IdPreview } from './widgets/id';

console.log('Welcome to tea town brother');

// Register the widget. This lets NetlifyCMS know about our custom widget
CMS.registerWidget('id', IdControl, IdPreview);
