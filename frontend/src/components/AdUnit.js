import React from 'react';

function AdUnit({ adUnit, onImpression, onClick }) {
  const handleAdClick = () => {
    if (onClick) onClick();
    window.open(adUnit.clickUrl, '_blank');
  };

  const containerStyle = {
    width: adUnit.width === 'flexible' ? '100%' : adUnit.width,
    aspectRatio: '1 / 1',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    border: '1px solid #ddd'
  };

  const imageStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  };

  React.useEffect(() => {
    if (onImpression) onImpression();
  }, [onImpression]);

  return (
    <div style={containerStyle} onClick={handleAdClick}>
      <img 
        src={adUnit.imageUrl} 
        alt={adUnit.name}
        style={imageStyle}
      />
    </div>
  );
}

export default AdUnit;
