document.addEventListener('DOMContentLoaded',()=>{
  const payBtn = document.getElementById('payBtn');
  const toast = document.getElementById('toast');
  const badges = Array.from(document.querySelectorAll('.badge'));

  function showToast(msg, short=true){
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(()=>toast.classList.add('hidden'), short?1700:3000);
  }

  payBtn.addEventListener('click', async ()=>{
    payBtn.disabled = true;
    const prev = payBtn.textContent;
    payBtn.textContent = 'Processing…';

    // simulate payment
    await new Promise(r=>setTimeout(r,1400));

    // mark as paid and update totals
    badges.forEach(b=>{b.textContent='Paid'; b.classList.remove('pending'); b.classList.add('paid');});

    // adjust totals (static example)
    document.getElementById('sum-sub').textContent = '$20.50';
    document.getElementById('sum-del').textContent = '$2.00';
    document.getElementById('sum-tax').textContent = '$1.64';
    document.getElementById('sum-total').textContent = '$24.14';

    payBtn.textContent = 'Paid ✓';
    payBtn.classList.add('paid');
    showToast('Payment successful — thank you!');
  });
});
