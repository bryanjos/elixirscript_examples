defmodule CodeSharing.PageController do
  use CodeSharing.Web, :controller

  def index(conn, _params) do
    pair = %Pair{key: 1, value: "A value"}
    render conn, "index.html", pair: pair
  end
end
