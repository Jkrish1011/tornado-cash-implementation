import React from 'react';
import Script from "next/script";

import Interface from '../components/Interface';

const index = () => {
  return (
    <div>
        <link rel="stylesheet" href="/css/bootstrap.min.css"></link>
        <Script src='./js/snarkjs.min.js' />
        <Interface />
    </div>
  )
}

export default index