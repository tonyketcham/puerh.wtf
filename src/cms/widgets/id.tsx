import * as React from 'react';
import { useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import type {
  CmsWidgetControlProps,
  CmsWidgetPreviewProps,
} from 'netlify-cms-core';

export const IdControl = ({ value, onChange }: CmsWidgetControlProps) => {
  useEffect(() => {
    if (!value) {
      onChange(uuid());
    }
  }, []);

  return <p>ID: {value}</p>;
};

export const IdPreview = ({ value }: CmsWidgetPreviewProps) => {
  return <p>ID: {value}</p>;
};
