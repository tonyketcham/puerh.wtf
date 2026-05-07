import * as React from 'react';
import { useEffect } from 'react';
import { nanoid } from 'nanoid';
import type {
  CmsWidgetControlProps,
  CmsWidgetPreviewProps,
} from 'netlify-cms-core';

export const IdControl = ({ value, onChange }: CmsWidgetControlProps) => {
  useEffect(() => {
    if (!value) {
      onChange(nanoid());
    }
  }, []);

  return <p>ID: {value}</p>;
};

export const IdPreview = ({ value }: CmsWidgetPreviewProps) => {
  return <p>ID: {value}</p>;
};
