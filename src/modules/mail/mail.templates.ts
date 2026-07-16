export const BRAND_ORANGE = '#f97316';
export const BRAND_CREAM = '#FAF0E6';

const BASE_URL = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',')[0] : 'http://localhost:5173';

function buildHtmlLayout(title: string, bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f4f4f5;
      color: #18181b;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    .header {
      background-color: ${BRAND_CREAM};
      padding: 30px 40px;
      text-align: center;
      border-bottom: 4px solid ${BRAND_ORANGE};
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 800;
      color: ${BRAND_ORANGE};
      letter-spacing: -0.5px;
    }
    .header p {
      margin: 5px 0 0 0;
      font-size: 14px;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .content {
      padding: 40px;
      line-height: 1.6;
    }
    .content h2 {
      margin-top: 0;
      font-size: 20px;
      color: #09090b;
    }
    .button-container {
      margin: 30px 0;
      text-align: center;
    }
    .button {
      display: inline-block;
      padding: 12px 28px;
      background-color: ${BRAND_ORANGE};
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 600;
      border-radius: 6px;
      font-size: 16px;
    }
    .footer {
      background-color: #f4f4f5;
      padding: 20px 40px;
      text-align: center;
      font-size: 13px;
      color: #a1a1aa;
    }
    .footer a {
      color: ${BRAND_ORANGE};
      text-decoration: none;
    }
    .highlight-box {
      background-color: #fff7ed;
      border: 1px solid #ffedd5;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
      text-align: center;
    }
    .highlight-text {
      font-size: 32px;
      font-weight: bold;
      color: ${BRAND_ORANGE};
      letter-spacing: 2px;
      margin: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e4e4e7;
    }
    th {
      font-weight: 600;
      color: #52525b;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>PPD Store</h1>
      <p>Everything for School</p>
    </div>
    <div class="content">
      ${bodyHtml}
    </div>
    <div class="footer">
      <p>You received this email because you are a registered user of PPD Store.</p>
      <p>Questions? Contact us at <a href="mailto:support@ppdstore.com">support@ppdstore.com</a></p>
    </div>
  </div>
</body>
</html>
  `;
}

export function getWelcomeTemplate(name: string): string {
  const html = `
    <h2>Welcome to PPD Store, ${name}!</h2>
    <p>We are thrilled to have you here. Since 1926, we have been providing the best school supplies for students across the country.</p>
    <p>Get ready to explore our wide range of premium stationery, backpacks, uniforms, and more!</p>
    <div class="button-container">
      <a href="${BASE_URL}/" class="button">Start Shopping</a>
    </div>
  `;
  return buildHtmlLayout('Welcome to PPD Store', html);
}

export function getOtpTemplate(otp: string): string {
  const html = `
    <h2>Your Verification Code</h2>
    <p>Please use the following 6-digit verification code to complete your action. This code will expire in 10 minutes.</p>
    <div class="highlight-box">
      <p class="highlight-text">${otp}</p>
    </div>
    <p>If you didn't request this code, you can safely ignore this email.</p>
  `;
  return buildHtmlLayout('Your Verification Code', html);
}

export function getPasswordResetTemplate(otp: string): string {
  const html = `
    <h2>Password Reset Request</h2>
    <p>We received a request to reset the password for your PPD Store account. Use the code below to securely reset your password.</p>
    <div class="highlight-box">
      <p class="highlight-text">${otp}</p>
    </div>
    <p>This code expires in 10 minutes. If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
  `;
  return buildHtmlLayout('Reset Your Password', html);
}

export function getOrderStatusTemplate(orderNumber: string, status: string, total: number, deliveryDate?: Date): string {
  let title = 'Order Update';
  let message = '';
  
  if (status === 'confirmed' || status === 'processing') {
    title = 'Order Confirmed';
    message = 'Great news! We have received your order and are currently processing it.';
  } else if (status === 'shipped') {
    title = 'Order Shipped';
    message = 'Your order has been packed and handed over to our delivery partner.';
  } else if (status === 'out-for-delivery') {
    title = 'Out for Delivery';
    message = 'Your package is out for delivery and should arrive today!';
  } else if (status === 'delivered') {
    title = 'Order Delivered';
    message = 'Your order has been successfully delivered. Thank you for shopping with us!';
  } else if (status === 'cancelled') {
    title = 'Order Cancelled';
    message = 'Your order has been cancelled.';
  } else {
    title = 'Order Status Updated';
    message = `Your order status is now: ${status}`;
  }

  const deliveryString = deliveryDate ? new Date(deliveryDate).toLocaleDateString() : 'TBD';

  const html = `
    <h2>${title}</h2>
    <p>${message}</p>
    
    <table>
      <tr>
        <th>Order Number</th>
        <td>#${orderNumber}</td>
      </tr>
      <tr>
        <th>Order Total</th>
        <td>₹${total}</td>
      </tr>
      <tr>
        <th>Expected Delivery</th>
        <td>${deliveryString}</td>
      </tr>
    </table>
    
    <div class="button-container">
      <a href="${BASE_URL}/profile/orders" class="button">Track Your Order</a>
    </div>
  `;
  return buildHtmlLayout(`${title} - ${orderNumber}`, html);
}

export function getPaymentSuccessTemplate(amount: number, transactionId: string): string {
  const html = `
    <h2>Payment Successful</h2>
    <p>We have successfully received your payment. Thank you for your purchase!</p>
    
    <table>
      <tr>
        <th>Amount Paid</th>
        <td>₹${amount}</td>
      </tr>
      <tr>
        <th>Transaction ID</th>
        <td>${transactionId}</td>
      </tr>
      <tr>
        <th>Date</th>
        <td>${new Date().toLocaleDateString()}</td>
      </tr>
    </table>
    
    <div class="button-container">
      <a href="${BASE_URL}/profile/orders" class="button">View Orders</a>
    </div>
  `;
  return buildHtmlLayout('Payment Receipt', html);
}
