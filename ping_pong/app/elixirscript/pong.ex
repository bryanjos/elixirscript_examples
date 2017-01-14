defmodule Pong do
  import JS, only: [defgen: 2, yield: 0, yield: 1]

  defgen start do
    JS.yield awai(0)
  end

  defgen awai(counter) do
    receive do
      {:ping, sender} -> send sender, {:pong, self}
    end

    :console.log("echo received #{counter} times")

    JS.yield awai(counter + 1)
  end

end
