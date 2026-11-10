/* Shared site-calendar date presets. Every server endpoint enforces the same limit. */
window.MySpaceDateRange = function({period,from,to,onChange}) {
  const iso=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  const today=document.body.dataset.today||iso(new Date());
  function valid(report=true) {
    from.setCustomValidity('');to.setCustomValidity('');
    if(!from.value||!to.value){(!from.value?from:to).setCustomValidity('Choose both From and To dates.');}
    else if(from.value>to.value)to.setCustomValidity('To date must be on or after From date.');
    else if((new Date(to.value+'T12:00:00Z')-new Date(from.value+'T12:00:00Z'))/86400000>=366)to.setCustomValidity('Choose a date range of 366 days or fewer.');
    const ok=from.checkValidity()&&to.checkValidity();
    if(!ok&&report)(!from.checkValidity()?from:to).reportValidity();
    return ok;
  }
  function preset(notify=true) {
    const end=new Date(today+'T12:00:00'),start=new Date(end);
    if(period.value==='week')start.setDate(start.getDate()-((start.getDay()+6)%7));
    if(period.value==='month')start.setDate(1);
    if(period.value==='year'){start.setMonth(0);start.setDate(1);}
    if(period.value!=='custom'){from.value=iso(start);to.value=iso(end);}
    if(valid()&&notify)onChange?.();
  }
  period.addEventListener('change',()=>preset());
  for(const input of [from,to])input.addEventListener('change',()=>{period.value='custom';if(valid())onChange?.();});
  period.value='today';preset(false);
  return {valid,reset(){period.value='today';preset(false);}};
};
