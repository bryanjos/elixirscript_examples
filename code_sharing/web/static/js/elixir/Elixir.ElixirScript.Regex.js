    import Elixir from '../elixir/Elixir.Bootstrap';
    import Elixir$ElixirScript$Kernel from '../elixir/Elixir.ElixirScript.Kernel';
    import Elixir$JS from '../elixir/Elixir.JS';
    import Elixir$ElixirScript$Keyword from '../elixir/Elixir.ElixirScript.Keyword';
    import Elixir$ElixirScript$String from '../elixir/Elixir.ElixirScript.String';
    const do_scan = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(regex,string,options,results)    {
        return     Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([null],function()    {
        return     results;
      }),Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(match)    {
        return     do_scan(regex,string,options,results.concat(match));
      })).call(this,run(regex,string,options));
      }));
    const make_global = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(regex)    {
        return     Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(x)    {
        return     new RegExp(source(regex),opts(regex) + 'g');
      },function(x)    {
        return     (x === null) || (x === false);
      }),Elixir.Core.Patterns.clause([Elixir.Core.Patterns.wildcard()],function()    {
        return     regex;
      })).call(this,Elixir$ElixirScript$String.contains__qmark__(Elixir.Core.Functions.call_property(regex,'flags'),'g'));
      }));
    const regex__qmark__ = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(term)    {
        return     term instanceof RegExp;
      }));
    const match__qmark__ = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(regex,string)    {
        return     regex.test(string);
      }));
    const run = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(Object.freeze([]))],function(regex,string,options)    {
        return     regex.exec(string);
      }));
    const scan = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(Object.freeze([]))],function(regex,string,options)    {
        let [reg] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.variable(),make_global(regex));
        return     do_scan(reg,string,options,Object.freeze([]));
      }));
    const compile = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable('')],function(source,options)    {
        return     Elixir.Core.SpecialForms._try(function()    {
        return     new Elixir.Core.Tuple(Symbol.for('ok'),new RegExp(source,options));
      },Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(x)    {
        return     new Elixir.Core.Tuple(Symbol.for('error'),Elixir.Core.Functions.call_property(x,'message'));
      })),null,null,null);
      }));
    const replace = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(Object.freeze([]))],function(regex,string,replacement,options)    {
        let [reg] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.variable(),Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(x)    {
        return     regex;
      },function(x)    {
        return     (x === null) || (x === false);
      }),Elixir.Core.Patterns.clause([Elixir.Core.Patterns.wildcard()],function()    {
        return     make_global(regex);
      })).call(this,Elixir$ElixirScript$Keyword.get(options,Symbol.for('global'),true)));
        return     string.replace(regex,replacement);
      }));
    const source = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(regex)    {
        return     Elixir.Core.Functions.call_property(regex,'source');
      }));
    const opts = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(regex)    {
        return     Elixir.Core.Functions.call_property(regex,'flags');
      }));
    const compile__emark__ = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable('')],function(source,options)    {
        return     new RegExp(source,options);
      }));
    export default {
        regex__qmark__,     match__qmark__,     run,     scan,     compile,     replace,     source,     opts,     compile__emark__
  };