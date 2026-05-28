// BuilderGallery.jsx — compatibility redirect to the real template gallery.
import React from 'react';

export function BuilderGallery({ navigate }) {
  React.useEffect(() => {
    navigate({ view: 'builder-templates' });
  }, [navigate]);

  return null;
}
